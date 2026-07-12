/**
 * Tokyo Calling 誤 artist 行を削除する前に、紐づく songs.artist_id を ATARASHII GAKKO! へ付け替える。
 *
 * Usage:
 *   npx tsx scripts/delete-tokyo-calling-artist-once.ts
 *   npx tsx scripts/delete-tokyo-calling-artist-once.ts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';

const TOKYO_CALLING_ARTIST_ID = '01f4d1b9-baa7-46c3-a907-106f1b76d7f7';
const ATARASHII_GAKKO_ARTIST_ID = '121b4c16-4818-4770-81d8-c875fe0c5d9e';

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

  const { data: songs, error: sErr } = await admin
    .from('songs')
    .select('id, main_artist, song_title, display_title')
    .eq('artist_id', TOKYO_CALLING_ARTIST_ID);
  if (sErr) throw sErr;

  console.log(`artist_id 付け替え対象: ${songs?.length ?? 0} 曲`);
  for (const row of songs ?? []) {
    const title = row.display_title ?? row.song_title ?? '(無題)';
    console.log(`- ${row.main_artist ?? '?'} / ${title} (${row.id})`);
  }

  if (!apply) {
    console.log('\n実行: npx tsx scripts/delete-tokyo-calling-artist-once.ts --apply');
    return;
  }

  if ((songs?.length ?? 0) > 0) {
    const ids = songs!.map((r) => r.id);
    const { error: uErr } = await admin
      .from('songs')
      .update({ artist_id: ATARASHII_GAKKO_ARTIST_ID })
      .in('id', ids);
    if (uErr) throw uErr;
    console.log(`\nupdated songs.artist_id → ATARASHII GAKKO!: ${ids.length}`);
  }

  const { count: creditCount } = await admin
    .from('song_credits')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', TOKYO_CALLING_ARTIST_ID);
  const { count: songCount } = await admin
    .from('songs')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', TOKYO_CALLING_ARTIST_ID);

  if ((creditCount ?? 0) > 0 || (songCount ?? 0) > 0) {
    console.error('参照が残っているため artists 削除をスキップ');
    process.exit(1);
  }

  const { data: deleted, error: dErr } = await admin
    .from('artists')
    .delete()
    .eq('id', TOKYO_CALLING_ARTIST_ID)
    .select('id, name');
  if (dErr) throw dErr;
  console.log('deleted artist:', deleted);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
