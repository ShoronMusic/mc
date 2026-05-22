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

  const { data: rows } = await admin
    .from('artists')
    .select('id, name, name_ja, music8_artist_slug, profile_text')
    .or('music8_artist_slug.eq.police,name.ilike.The Police');
  const list = rows ?? [];
  const master = list.find((r) => (r.music8_artist_slug ?? '').toLowerCase() === 'police');
  const stub = list.find((r) => !r.music8_artist_slug && (r.name ?? '').toLowerCase() === 'the police');
  if (!master?.id) {
    console.error('master not found', list);
    process.exit(1);
  }
  const patch: Record<string, unknown> = {
    name: 'The Police',
    music8_artist_slug: 'police',
  };
  if (!master.name_ja && stub?.name_ja) patch.name_ja = stub.name_ja;
  if (!master.profile_text && stub?.profile_text) patch.profile_text = stub.profile_text;
  await admin.from('artists').update(patch).eq('id', master.id);
  await admin.from('songs').update({ artist_id: master.id }).eq('music8_artist_slug', 'police');
  if (stub?.id && stub.id !== master.id) {
    const { count } = await admin
      .from('songs')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', stub.id);
    if ((count ?? 0) === 0) {
      await admin.from('artists').delete().eq('id', stub.id);
      console.log('deleted stub', stub.id);
    }
  }
  console.log('merged master', master.id);
}

main();
