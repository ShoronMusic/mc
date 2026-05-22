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
  const { data: stubs } = await admin
    .from('artists')
    .select('id, name, music8_artist_slug')
    .ilike('name', 'Police')
    .is('music8_artist_slug', null);
  for (const a of stubs ?? []) {
    const { count } = await admin
      .from('songs')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', a.id);
    console.log('stub', a.id, a.name, 'song_refs', count);
    if ((count ?? 0) === 0) {
      const { error } = await admin.from('artists').delete().eq('id', a.id);
      console.log('deleted', !error, error?.message ?? '');
    }
  }
}

main();
