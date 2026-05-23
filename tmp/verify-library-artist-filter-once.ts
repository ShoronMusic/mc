import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchSongsForLibraryArtistSelection } from '@/lib/library-search-query';

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
  const sel = 'id, display_title, main_artist, song_title';
  for (const a of ['Bruno Mars', 'Lady Gaga']) {
    const rows = await fetchSongsForLibraryArtistSelection(admin, a, sel, 200);
    const hit = rows.find((r) => (r.display_title ?? '').includes('Die With A Smile'));
    console.log(a, 'total', rows.length, 'die', hit?.display_title ?? 'NONE');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
