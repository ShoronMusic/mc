import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';

function loadDotEnvLocal(): void {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const admin = createAdminClient();
  const vid = '1cnndBdzCAk';

  const { data: sv } = await admin
    .from('song_videos')
    .select('video_id,song_id,variant')
    .eq('video_id', vid)
    .maybeSingle();

  const songId = typeof sv?.song_id === 'string' ? sv.song_id : '';
  const { data: song } = await admin
    .from('songs')
    .select('id,song_title,main_artist,catalog_scope,original_release_date')
    .eq('id', songId)
    .maybeSingle();

  const { data: artist } = await admin
    .from('artists')
    .select('id,name,catalog_scope,youtube_channel_id')
    .eq('name', '米津玄師')
    .maybeSingle();

  const { count } = await admin
    .from('songs')
    .select('id', { count: 'exact', head: true })
    .eq('catalog_scope', 'domestic')
    .ilike('main_artist', '%米津%');

  console.log(JSON.stringify({ songVideo: sv, song, artist, domesticYonezuSongCount: count }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
