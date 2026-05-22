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
  if (!admin) process.exit(1);
  const slug = process.argv[2] ?? 'pretenders';
  const q = process.argv[3] ?? '';
  let query = admin
    .from('songs')
    .select('id, main_artist, song_title, display_title')
    .eq('music8_artist_slug', slug);
  if (q) query = query.ilike('display_title', `%${q}%`);
  const { data } = await query.order('display_title');
  for (const s of data ?? []) {
    console.log(s.main_artist, '|', s.display_title);
  }
}

main();
