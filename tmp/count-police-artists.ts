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
    console.error('createAdminClient が null。.env.local の SUPABASE_* を確認してください。');
    process.exit(1);
  }

  async function countExact(mainArtist: string): Promise<number> {
    const { count, error } = await admin
      .from('songs')
      .select('id', { count: 'exact', head: true })
      .eq('main_artist', mainArtist);
    if (error) throw error;
    return count ?? 0;
  }

  const { data: rows, error: rowsErr } = await admin
    .from('songs')
    .select('main_artist')
    .ilike('main_artist', '%police%');
  if (rowsErr) throw rowsErr;

  const groups = new Map<string, number>();
  for (const r of rows ?? []) {
    const k = (r.main_artist ?? '(null)').trim();
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]);

  const { data: artists, error: artErr } = await admin
    .from('artists')
    .select('id, name, name_ja, music8_artist_slug')
    .or('name.ilike.%police%,music8_artist_slug.eq.police');
  if (artErr) throw artErr;

  const { count: slugCount, error: slugErr } = await admin
    .from('songs')
    .select('id', { count: 'exact', head: true })
    .eq('music8_artist_slug', 'police');
  if (slugErr) throw slugErr;

  console.log('=== songs.main_artist (police 含む) ===');
  console.log('完全一致 "The Police":', await countExact('The Police'));
  console.log('完全一致 "Police":', await countExact('Police'));
  console.log('ilike %police% 合計:', rows?.length ?? 0);
  console.log('');
  console.log('内訳 (main_artist):');
  for (const [name, n] of sorted) {
    console.log(`  ${JSON.stringify(name)}: ${n}`);
  }

  console.log('');
  console.log('=== artists (police 関連) ===');
  console.log('件数:', artists?.length ?? 0);
  for (const a of artists ?? []) {
    console.log(
      ' -',
      JSON.stringify({
        name: a.name,
        name_ja: a.name_ja,
        music8_artist_slug: a.music8_artist_slug,
      }),
    );
  }

  console.log('');
  console.log('music8_artist_slug = police の曲数:', slugCount ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
