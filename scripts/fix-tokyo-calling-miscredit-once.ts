/**
 * 「Tokyo Calling」は Atarashii Gakko! の曲名。誤って artists / song_credits に
 * アーティストとして登録された行を除去する（曲マスタは削除しない）。
 *
 * Usage:
 *   npx tsx scripts/fix-tokyo-calling-miscredit-once.ts
 *   npx tsx scripts/fix-tokyo-calling-miscredit-once.ts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { clearLibraryArtistIndexCache } from '@/lib/build-library-artist-index';

const TOKYO_CALLING_ARTIST_NAME = 'Tokyo Calling';

function loadDotEnvLocal(): void {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const apply = process.argv.includes('--apply');
  const admin = createAdminClient();
  if (!admin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL が必要です。');
    process.exit(1);
  }

  const { data: artists, error: aErr } = await admin
    .from('artists')
    .select('id, name')
    .eq('name', TOKYO_CALLING_ARTIST_NAME);
  if (aErr) throw aErr;
  const artistIds = (artists ?? []).map((a) => a.id).filter(Boolean);
  if (artistIds.length === 0) {
    console.log('artists に Tokyo Calling なし。終了。');
    return;
  }

  const { data: credits, error: cErr } = await admin
    .from('song_credits')
    .select('id, song_id, artist_id, songs(main_artist, song_title, display_title)')
    .in('artist_id', artistIds);
  if (cErr) throw cErr;

  console.log(`誤クレジット: ${credits?.length ?? 0} 件（dry-run${apply ? ' → apply' : ''}）\n`);
  for (const row of credits ?? []) {
    const song = Array.isArray(row.songs) ? row.songs[0] : row.songs;
    const title = song?.display_title ?? song?.song_title ?? '(無題)';
    console.log(`- ${song?.main_artist ?? '?'} / ${title}`);
    console.log(`  credit_id=${row.id} song_id=${row.song_id}`);
  }

  if (!apply) {
    console.log('\n実行: npx tsx scripts/fix-tokyo-calling-miscredit-once.ts --apply');
    return;
  }

  const creditIds = (credits ?? []).map((r) => r.id).filter(Boolean);
  if (creditIds.length > 0) {
    const { error: dErr } = await admin.from('song_credits').delete().in('id', creditIds);
    if (dErr) throw dErr;
    console.log(`\ndeleted song_credits: ${creditIds.length}`);
  }

  for (const artistId of artistIds) {
    const { count } = await admin
      .from('song_credits')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId);
    const { data: songRows } = await admin
      .from('songs')
      .select('id, main_artist')
      .eq('artist_id', artistId);
    if ((songRows?.length ?? 0) > 0) {
      console.log(`songs.artist_id が ${TOKYO_CALLING_ARTIST_NAME} の行: ${songRows?.length ?? 0}`);
      for (const row of songRows ?? []) {
        console.log(`  - ${row.main_artist ?? '?'} (${row.id})`);
      }
    }
    if ((count ?? 0) === 0 && (songRows?.length ?? 0) === 0) {
      const { error: delArtistErr } = await admin.from('artists').delete().eq('id', artistId);
      if (delArtistErr) {
        console.warn(`artists delete skipped ${artistId}:`, delArtistErr.message);
      } else {
        console.log(`deleted orphan artist: ${TOKYO_CALLING_ARTIST_NAME} (${artistId})`);
      }
    }
  }

  clearLibraryArtistIndexCache();
  console.log('完了');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
