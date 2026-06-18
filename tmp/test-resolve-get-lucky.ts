import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveMusic8WpSongJsonForRow } from '@/lib/music8-wp-song-json-resolve';

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadDotEnvLocal();
  const admin = createAdminClient();
  const id = '8040a05a-003f-43ea-9a28-8f35e4502926';
  const { data } = await admin!.from('songs').select('*').eq('id', id).single();
  const { data: vids } = await admin!.from('song_videos').select('video_id').eq('song_id', id).limit(1);
  const videoId = (vids?.[0] as { video_id?: string })?.video_id ?? null;
  const r = await resolveMusic8WpSongJsonForRow(data as never, { videoId, videoIdFallback: true });
  console.log('videoId', videoId, 'resolved', r?.resolvedVia, r?.canonicalArtistSlug);
}

main();
