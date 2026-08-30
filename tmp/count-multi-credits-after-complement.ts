import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';

function loadDotEnvLocal() {
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

async function main() {
  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) process.exit(1);

  const { count: totalSongs } = await admin.from('songs').select('*', { count: 'exact', head: true });
  const { count: creditRows } = await admin.from('song_credits').select('*', { count: 'exact', head: true });
  const { count: commaSpotify } = await admin
    .from('songs')
    .select('*', { count: 'exact', head: true })
    .not('spotify_artists', 'is', null)
    .like('spotify_artists', '%,%');

  const perSong = new Map<string, number>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.from('song_credits').select('song_id').range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) {
      const id = (r as { song_id: string }).song_id;
      perSong.set(id, (perSong.get(id) ?? 0) + 1);
    }
    if (data.length < PAGE) break;
  }

  let songsWithCredits = 0;
  let multi = 0;
  for (const c of perSong.values()) {
    songsWithCredits += 1;
    if (c >= 2) multi += 1;
  }

  console.log(
    JSON.stringify(
      {
        total_songs: totalSongs,
        song_credits_rows: creditRows,
        songs_with_any_credit: songsWithCredits,
        songs_with_multi_credits: multi,
        songs_spotify_artists_comma: commaSpotify,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
