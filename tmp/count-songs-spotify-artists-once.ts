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
  if (!admin) throw new Error('createAdminClient failed');

  const { count: total, error: e1 } = await admin.from('songs').select('*', { count: 'exact', head: true });
  const { count: notNull, error: e2 } = await admin
    .from('songs')
    .select('*', { count: 'exact', head: true })
    .not('spotify_artists', 'is', null);
  const { count: nonEmpty, error: e3 } = await admin
    .from('songs')
    .select('*', { count: 'exact', head: true })
    .not('spotify_artists', 'is', null)
    .neq('spotify_artists', '');

  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;

  const t = total ?? 0;
  const nn = notNull ?? 0;
  const w = nonEmpty ?? 0;
  const emptyString = nn - w;

  console.log(
    JSON.stringify(
      {
        total_songs: t,
        spotify_artists_not_null: nn,
        spotify_artists_non_empty: w,
        spotify_artists_null: t - nn,
        spotify_artists_empty_string: emptyString,
        without_usable_value: t - w,
        pct_non_empty: t ? `${((100 * w) / t).toFixed(1)}%` : '0.0%',
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
