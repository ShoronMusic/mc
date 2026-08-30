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

  const { data: songs, error } = await admin
    .from('songs')
    .select('*')
    .or(
      'display_title.eq.The Police - Every Breath You Take,display_title.ilike.%Every Breath You Take%',
    );
  if (error) throw error;

  const out: unknown[] = [];
  for (const song of songs ?? []) {
    const songId = (song as { id: string }).id;
    const artistId = (song as { artist_id?: string | null }).artist_id ?? null;

    const { data: videos } = await admin.from('song_videos').select('*').eq('song_id', songId);
    const { data: credits } = await admin
      .from('song_credits')
      .select('*')
      .eq('song_id', songId)
      .order('display_order');

    const creditArtistIds = [
      ...new Set(
        (credits ?? [])
          .map((c) => (c as { artist_id?: string }).artist_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (artistId && !creditArtistIds.includes(artistId)) creditArtistIds.push(artistId);

    const artists: unknown[] = [];
    for (const aid of creditArtistIds) {
      const { data: a } = await admin.from('artists').select('*').eq('id', aid).maybeSingle();
      if (a) artists.push(a);
    }
    const { data: police } = await admin.from('artists').select('*').ilike('name', 'The Police');
    for (const a of police ?? []) {
      const id = (a as { id: string }).id;
      if (!artists.some((x) => (x as { id: string }).id === id)) artists.push(a);
    }

    const { data: styles } = await admin
      .from('song_styles')
      .select('style_id, catalog_styles(slug, name)')
      .eq('song_id', songId);
    const { data: genres } = await admin
      .from('song_genres')
      .select('genre_id, catalog_genres(slug, name)')
      .eq('song_id', songId);
    const { data: vocals } = await admin
      .from('song_vocals')
      .select('vocal_id, catalog_vocals(slug, name)')
      .eq('song_id', songId);
    const { data: tags } = await admin
      .from('song_tags')
      .select('tag_id, catalog_tags(slug, name)')
      .eq('song_id', songId);

    out.push({
      song,
      song_videos: videos ?? [],
      song_credits: credits ?? [],
      artists,
      catalog: { styles: styles ?? [], genres: genres ?? [], vocals: vocals ?? [], tags: tags ?? [] },
    });
  }

  const jsonPath = path.resolve(process.cwd(), 'tmp', 'the-police-every-breath-you-take.json');
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify({ count: out.length, path: jsonPath }, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
