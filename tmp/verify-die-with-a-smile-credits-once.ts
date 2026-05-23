import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';

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
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) throw new Error('no admin');

  const { data: song } = await admin
    .from('songs')
    .select('id, display_title, main_artist, artist_id, spotify_artists')
    .eq('music8_song_slug', 'die-with-a-smile')
    .maybeSingle();
  if (!song) {
    console.log('song not found');
    return;
  }
  const { data: credits } = await admin
    .from('song_credits')
    .select('display_order, role, source, is_display_main, artists(id, name, music8_artist_slug)')
    .eq('song_id', song.id)
    .order('display_order');
  console.log('song:', JSON.stringify(song, null, 2));
  console.log('credits:', JSON.stringify(credits, null, 2));

  const { count: totalCredits } = await admin
    .from('song_credits')
    .select('*', { count: 'exact', head: true });
  const { count: songsWithCredits } = await admin
    .from('song_credits')
    .select('song_id', { count: 'exact', head: true });
  console.log('song_credits rows:', totalCredits);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
