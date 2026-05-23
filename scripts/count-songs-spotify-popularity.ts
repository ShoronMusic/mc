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
  const { count: total, error: e1 } = await admin.from('songs').select('*', { count: 'exact', head: true });
  const { count: withPop, error: e2 } = await admin
    .from('songs')
    .select('*', { count: 'exact', head: true })
    .not('spotify_popularity', 'is', null);
  const { count: missing, error: e3 } = await admin
    .from('songs')
    .select('*', { count: 'exact', head: true })
    .is('spotify_popularity', null);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  const t = total ?? 0;
  const w = withPop ?? 0;
  const m = missing ?? 0;
  const pct = t ? ((100 * w) / t).toFixed(1) : '0.0';
  console.log(
    JSON.stringify(
      {
        total_songs: t,
        with_spotify_popularity: w,
        still_missing: m,
        pct_with_popularity: `${pct}%`,
      },
      null,
      2,
    ),
  );
  const { data: left } = await admin
    .from('songs')
    .select('display_title')
    .is('spotify_popularity', null)
    .order('display_title');
  if (left?.length) {
    console.log('\nstill_missing_titles:');
    for (const r of left) console.log(`  - ${r.display_title}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
