import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteSongMasterCascade } from '@/lib/admin-delete-song-master';
import { fetchAllSongRowsForArtistAggregation } from '@/lib/library-artist-count-rows';
import { clearLibraryArtistIndexCache } from '@/lib/build-library-artist-index';

const DELETE_MAIN_ARTISTS_EXACT = [
  '777mylene',
  'K. Ch',
  'Billyjoel',
  'D.c.j',
  'Fantasy Bgm',
  'Oldkids Memories',
  'Pokotanconcorde',
  'Released On: 1973',
  'Suisei Channel',
  'Tokyo Calling',
  'Warner Music Japan',
  'Yoasobi「怪物」official Music Video (Yoasobi',
  'Your Song',
  'たけ【アニメ】',
  'ビリー・ジョエル｜Billy Joel',
  'やさしさに包まれたなら',
  'ルージュの伝言',
  '僕の歌は君の歌（ユア・ソング） エルトン・ジョン Your Song',
  '山下達郎 Tatsuro Yamashita',
  '感動画.Ch',
  '穴釣りペンギン',
  '紅蓮華 / The First Take',
] as const;

/** song_credits だけ削除（親曲は残す） */
const DELETE_CREDIT_ARTISTS_EXACT: { artistName: string; songId: string }[] = [
  { artistName: '4EVE', songId: 'f041cf75-fc78-4c49-a4a9-c66f5cb56ba7' },
  { artistName: 'Krown', songId: 'ebcb7b2c-1c6d-46d9-9690-95ed6265fad6' },
  { artistName: 'osmkapo', songId: 'ebcb7b2c-1c6d-46d9-9690-95ed6265fad6' },
  { artistName: 'milli', songId: 'a4f4d7fe-41b4-4018-a8b2-8af19576e673' },
  { artistName: 'VALORANT', songId: '78285d62-911d-4152-9746-62fd0d574564' },
];

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

async function deleteCreditsForArtistOnSong(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  artistName: string,
  songId: string,
): Promise<{ ok: boolean; message: string }> {
  const { data: artists, error: aErr } = await admin
    .from('artists')
    .select('id, name')
    .eq('name', artistName);
  if (aErr) return { ok: false, message: aErr.message };
  const artistIds = (artists ?? []).map((a) => a.id).filter(Boolean);
  if (artistIds.length === 0) {
    return { ok: false, message: `artists 行なし: ${artistName}` };
  }
  const { data: deleted, error: dErr } = await admin
    .from('song_credits')
    .delete()
    .eq('song_id', songId)
    .in('artist_id', artistIds)
    .select('id');
  if (dErr) return { ok: false, message: dErr.message };
  if (!deleted?.length) return { ok: false, message: 'song_credits 行なし' };
  return { ok: true, message: `deleted ${deleted.length} credit row(s)` };
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const apply = process.argv.includes('--apply');
  const admin = createAdminClient();
  if (!admin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL が必要です。');
    process.exit(1);
  }

  const rows = await fetchAllSongRowsForArtistAggregation(admin);
  const exactSet = new Set(DELETE_MAIN_ARTISTS_EXACT.map((n) => n.toLowerCase()));
  const deleteTargets = new Map<string, { main_artist: string; title: string }>();
  for (const row of rows) {
    const artist = (row.main_artist ?? '').trim();
    if (!artist || !exactSet.has(artist.toLowerCase())) continue;
    deleteTargets.set(row.id, {
      main_artist: artist,
      title: (row.song_title ?? row.display_title ?? '').trim() || '(無題)',
    });
  }

  console.log(`曲マスタ削除対象: ${deleteTargets.size} 曲`);
  for (const [id, meta] of deleteTargets) {
    console.log(`- ${meta.main_artist} / ${meta.title} (${id})`);
  }

  console.log(`\nsong_credits 削除対象: ${DELETE_CREDIT_ARTISTS_EXACT.length} 件`);
  for (const t of DELETE_CREDIT_ARTISTS_EXACT) {
    const song = rows.find((r) => r.id === t.songId);
    console.log(`- ${t.artistName} on ${song?.display_title ?? song?.main_artist ?? t.songId}`);
  }

  if (!apply) {
    console.log('\n実行: npx tsx scripts/cleanup-domestic-junk-songs-once.ts --apply');
    return;
  }

  let songOk = 0;
  let songNg = 0;
  for (const [id, meta] of deleteTargets) {
    const result = await deleteSongMasterCascade(admin, id);
    if (result.ok) {
      songOk += 1;
      console.log(`deleted song: ${meta.main_artist} (${id})`);
    } else {
      songNg += 1;
      console.error(`failed song: ${meta.main_artist} (${id}) — ${result.message}`);
    }
  }

  let creditOk = 0;
  let creditNg = 0;
  for (const t of DELETE_CREDIT_ARTISTS_EXACT) {
    const result = await deleteCreditsForArtistOnSong(admin, t.artistName, t.songId);
    if (result.ok) {
      creditOk += 1;
      console.log(`deleted credit: ${t.artistName} / ${t.songId} — ${result.message}`);
    } else {
      creditNg += 1;
      console.error(`failed credit: ${t.artistName} / ${t.songId} — ${result.message}`);
    }
  }

  clearLibraryArtistIndexCache();
  console.log(`\n完了: songs deleted=${songOk} failed=${songNg}, credits deleted=${creditOk} failed=${creditNg}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
