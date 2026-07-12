/**
 * Mr.Children「Tomorrow never knows」テスト選曲の視聴履歴（＋曲マスタ）を削除
 *
 * 対象 video_id: Nxwt_s1IM04
 * 対象 song_id: 38b53e14-ceb1-40bc-be3a-89ebbeadd0da（song_videos 経由でも検出）
 *
 * Usage:
 *   npx tsx scripts/delete-mrchildren-tomorrow-never-knows-once.ts          # dry-run
 *   npx tsx scripts/delete-mrchildren-tomorrow-never-knows-once.ts --apply  # 削除実行
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteSongMasterCascade } from '@/lib/admin-delete-song-master';

const TARGET_VIDEO_ID = 'Nxwt_s1lM04';
const TARGET_SONG_ID = '38b53e14-ceb1-40bc-be3a-89ebbeadd0da';

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

  const songIdsToDelete = new Set<string>([TARGET_SONG_ID]);

  console.log(`\n--- ${TARGET_VIDEO_ID} ---`);

  const { data: histRows, error: histErr } = await admin
    .from('room_playback_history')
    .select('id, played_at, title, artist_name, product, room_id')
    .eq('video_id', TARGET_VIDEO_ID)
    .order('played_at', { ascending: false });
  if (histErr) {
    console.error('room_playback_history select', histErr.message);
    process.exit(1);
  }
  console.log(`room_playback_history: ${histRows?.length ?? 0} 行`);
  for (const row of histRows ?? []) {
    console.log(' ', row.id, row.played_at, row.title?.slice(0, 100));
  }

  const { data: svRows, error: svErr } = await admin
    .from('song_videos')
    .select('video_id, song_id, variant')
    .eq('video_id', TARGET_VIDEO_ID);
  if (svErr && svErr.code !== '42P01') {
    console.error('song_videos select', svErr.message);
    process.exit(1);
  }
  console.log(`song_videos: ${svRows?.length ?? 0} 行`);
  for (const row of svRows ?? []) {
    const sid = typeof row.song_id === 'string' ? row.song_id.trim() : '';
    if (sid) songIdsToDelete.add(sid);
    console.log(' ', row);
  }

  for (const songId of songIdsToDelete) {
    const { data: song, error: songErr } = await admin
      .from('songs')
      .select('id, display_title, main_artist, song_title, catalog_scope')
      .eq('id', songId)
      .maybeSingle();
    if (songErr) {
      console.error('songs select', songId, songErr.message);
      continue;
    }
    console.log('\n[song master]', song);
  }

  if (!apply) {
    console.log('\n[dry-run] 削除するには --apply を付けて再実行してください。');
    return;
  }

  const { error: delHistErr, count } = await admin
    .from('room_playback_history')
    .delete({ count: 'exact' })
    .eq('video_id', TARGET_VIDEO_ID);
  if (delHistErr) {
    console.error('room_playback_history delete', delHistErr.message);
    process.exit(1);
  }
  console.log(`deleted room_playback_history: ${count ?? '?'} 行`);

  for (const songId of songIdsToDelete) {
    const result = await deleteSongMasterCascade(admin, songId);
    if (result.ok) {
      console.log(`deleted song master ${songId}`);
    } else {
      console.error(`song master delete failed ${songId}:`, result.message);
    }
  }

  console.log('\n完了。再選曲で邦楽表記ルールを確認できます。');
}

async function searchBroad(): Promise<void> {
  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) {
    console.error('no admin');
    process.exit(1);
  }

  const hist = await admin
    .from('room_playback_history')
    .select('id, video_id, played_at, title, artist_name, product')
    .or(
      'title.ilike.%Tomorrow Never Knows%,title.ilike.%Tomorrow never knows%,artist_name.ilike.%Mr.children%,video_id.eq.Nxwt_s1IM04',
    )
    .order('played_at', { ascending: false })
    .limit(30);
  console.log('history match:', hist.data?.length, hist.error?.message);
  for (const r of hist.data ?? []) console.log(r);

  const sv = await admin
    .from('song_videos')
    .select('video_id, song_id, variant')
    .eq('song_id', TARGET_SONG_ID);
  console.log('song_videos for song:', sv.data, sv.error?.message);
}

if (process.argv.includes('--search')) {
  searchBroad().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
