import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '../src/lib/supabase/admin';

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
    console.error('createAdminClient unavailable (.env.local)');
    process.exit(1);
  }

  const total = await admin.from('artists').select('*', { count: 'exact', head: true });
  if (total.error) {
    console.error(total.error);
    process.exit(1);
  }

  const withSlug = await admin
    .from('artists')
    .select('*', { count: 'exact', head: true })
    .not('music8_artist_slug', 'is', null);

  const songs = await admin.from('songs').select('*', { count: 'exact', head: true });

  const linked = await admin
    .from('songs')
    .select('*', { count: 'exact', head: true })
    .not('artist_id', 'is', null);

  console.log(
    JSON.stringify(
      {
        artists_total: total.count ?? null,
        artists_with_music8_artist_slug: withSlug.count ?? null,
        artists_without_music8_slug:
          total.count != null && withSlug.count != null ? total.count - withSlug.count : null,
        songs_total: songs.count ?? null,
        songs_with_artist_id: linked.count ?? null,
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
