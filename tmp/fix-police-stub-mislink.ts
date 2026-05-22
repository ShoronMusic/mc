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
  const stubId = '90c7e3cc-e3b9-4ecf-b41d-c6a91f2dbb3a';
  const songId = '9c89b941-d123-4b80-9039-e2e36c5529bf';
  const { data: m } = await admin
    .from('artists')
    .select('id')
    .eq('music8_artist_slug', 'eberhard-schoener')
    .maybeSingle();
  await admin.from('songs').update({ artist_id: m?.id ?? null }).eq('id', songId);
  const { count } = await admin
    .from('songs')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', stubId);
  const { error } = await admin.from('artists').delete().eq('id', stubId);
  console.log({ stubRefs: count, deleted: !error, err: error?.message });
}

main();
