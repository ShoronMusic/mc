import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '../src/lib/supabase/admin';
import { buildSongDisplayTitle } from '../src/lib/music8-canonical-artist-name';

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

const FIXES: Array<{ slug: string; canonical: string }> = [
  { slug: '1975', canonical: 'The 1975' },
  { slug: 'sugarhill-gang', canonical: 'The Sugarhill Gang' },
  { slug: 'pretenders', canonical: 'The Pretenders' },
];

async function main(): Promise<void> {
  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) process.exit(1);

  for (const { slug, canonical } of FIXES) {
    const { data: master } = await admin
      .from('artists')
      .select('id')
      .eq('music8_artist_slug', slug)
      .maybeSingle();
    const { data: rows } = await admin
      .from('songs')
      .select('id, main_artist, song_title, display_title')
      .eq('music8_artist_slug', slug);
    for (const s of rows ?? []) {
      const cur = (s.main_artist ?? '').trim();
      if (cur === canonical) continue;
      const title =
        (s.song_title ?? '').trim() ||
        (s.display_title ?? '').split(' - ').slice(1).join(' - ').trim();
      const dt = buildSongDisplayTitle(canonical, title);
      const { error } = await admin
        .from('songs')
        .update({
          main_artist: canonical,
          display_title: dt,
          artist_id: master?.id ?? null,
        })
        .eq('id', s.id);
      console.log(slug, cur, '->', canonical, error?.message ?? 'ok');
    }
  }
}

main();
