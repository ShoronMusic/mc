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
  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient failed');
    process.exit(1);
  }

  const { data: songs, error } = await admin
    .from('songs')
    .select(
      'id, main_artist, song_title, display_title, artist_id, music8_artist_slug, music8_song_slug, music8_song_id, primary_artist_name_ja, spotify_track_id, spotify_popularity, spotify_artists, original_release_date, style, play_count, music8_song_data, song_videos(video_id, variant, youtube_published_at)',
    )
    .or('display_title.ilike.%Die With A Smile%,song_title.ilike.%Die With A Smile%');

  if (error) throw error;

  console.log('songs count:', songs?.length ?? 0);
  for (const s of songs ?? []) {
    console.log('\n=== song ===');
    const { music8_song_data, song_videos, ...rest } = s as Record<string, unknown>;
    console.log(JSON.stringify(rest, null, 2));
    if (song_videos) console.log('song_videos:', JSON.stringify(song_videos, null, 2));
    if (music8_song_data) {
      const snap = music8_song_data as Record<string, unknown>;
      const slim = {
        primary_artist_name: snap.primary_artist_name,
        primary_artist_name_ja: snap.primary_artist_name_ja,
        main_artists: snap.main_artists,
        stable_key: snap.stable_key,
        title: snap.title,
        slug: snap.slug,
      };
      console.log('music8_song_data (slim):', JSON.stringify(slim, null, 2));
    }
    const artistId = (s as { artist_id?: string | null }).artist_id;
    if (artistId) {
      const { data: artist } = await admin
        .from('artists')
        .select('id, name, name_ja, music8_artist_slug, spotify_artist_id')
        .eq('id', artistId)
        .maybeSingle();
      console.log('linked artist:', JSON.stringify(artist, null, 2));
    }
  }

  const { data: gaga } = await admin
    .from('artists')
    .select('id, name, name_ja, music8_artist_slug')
    .ilike('name', '%Lady Gaga%');
  const { data: mars } = await admin
    .from('artists')
    .select('id, name, name_ja, music8_artist_slug')
    .ilike('name', '%Bruno Mars%');
  console.log('\n=== artists Lady Gaga ===', JSON.stringify(gaga, null, 2));
  console.log('\n=== artists Bruno Mars ===', JSON.stringify(mars, null, 2));

  const { data: gagaSongs } = await admin
    .from('songs')
    .select('id, main_artist, display_title, music8_song_slug, spotify_artists')
    .or('main_artist.ilike.%Lady Gaga%,display_title.ilike.%Lady Gaga%');
  console.log('\n=== songs mentioning Lady Gaga ===', JSON.stringify(gagaSongs, null, 2));

  const { data: official } = await admin
    .from('songs')
    .select(
      '*, song_videos(video_id, variant), music8_song_data',
    )
    .eq('music8_song_slug', 'die-with-a-smile')
    .maybeSingle();
  if (official) {
    const o = official as Record<string, unknown>;
    const snap = o.music8_song_data as Record<string, unknown> | null;
    console.log('\n=== OFFICIAL row (lady-gaga die-with-a-smile) ===');
    const { music8_song_data, song_videos, ...rest } = o;
    console.log(JSON.stringify(rest, null, 2));
    if (song_videos) console.log('song_videos:', JSON.stringify(song_videos, null, 2));
    if (snap) {
      console.log(
        'music8_song_data slim:',
        JSON.stringify(
          {
            primary_artist_name: snap.primary_artist_name,
            main_artists: snap.main_artists,
            title: snap.title,
            slug: snap.slug,
          },
          null,
          2,
        ),
      );
    }
    const aid = o.artist_id as string | null;
    if (aid) {
      const { data: artist } = await admin.from('artists').select('*').eq('id', aid).maybeSingle();
      console.log('linked artist:', JSON.stringify(artist, null, 2));
    }
  }

  const { data: vid } = await admin
    .from('song_videos')
    .select('video_id, variant, songs(id, display_title, main_artist)')
    .eq('video_id', 'DeBYBD7E-Zg');
  console.log('\n=== video DeBYBD7E-Zg ===', JSON.stringify(vid, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
