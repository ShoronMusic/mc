import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';

function loadDotEnvLocal(): void {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const admin = createAdminClient();

  const { count } = await admin
    .from('songs')
    .select('id', { count: 'exact', head: true })
    .eq('catalog_scope', 'domestic')
    .ilike('main_artist', '%米津%');

  const { data: recent } = await admin
    .from('songs')
    .select('id,song_title,main_artist,created_at')
    .eq('catalog_scope', 'domestic')
    .ilike('main_artist', '%米津%')
    .order('created_at', { ascending: false })
    .limit(15);

  const { data: janeDoe } = await admin
    .from('songs')
    .select('id,song_title,display_title')
    .eq('catalog_scope', 'domestic')
    .ilike('song_title', '%JANE DOE%')
    .limit(5);

  let janeCredits: unknown[] = [];
  if (janeDoe?.[0]?.id) {
    const { data: credits } = await admin
      .from('song_credits')
      .select('artist_id, role, artists(name)')
      .eq('song_id', janeDoe[0].id);
    janeCredits = credits ?? [];
  }

  console.log(
    JSON.stringify(
      {
        domesticYonezuCount: count,
        recentTitles: recent?.map((r) => r.song_title),
        janeDoe,
        janeCredits,
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
