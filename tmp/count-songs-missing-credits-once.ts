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
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) throw new Error('no admin');

  const { count: totalSongs } = await admin.from('songs').select('*', { count: 'exact', head: true });
  const { count: creditRows } = await admin.from('song_credits').select('*', { count: 'exact', head: true });

  let missing = 0;
  const PAGE = 500;
  const missingSamples: string[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await admin
      .from('songs')
      .select('id, display_title')
      .order('id')
      .range(off, off + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    const ids = data.map((r) => r.id);
    const { data: creds } = await admin.from('song_credits').select('song_id').in('song_id', ids);
    const has = new Set((creds ?? []).map((c) => c.song_id));
    for (const s of data) {
      if (!has.has(s.id)) {
        missing++;
        if (missingSamples.length < 20) missingSamples.push(s.display_title ?? s.id);
      }
    }
    if (data.length < PAGE) break;
  }

  console.log(
    JSON.stringify(
      { total_songs: totalSongs, song_credits_rows: creditRows, songs_without_any_credit: missing, samples: missingSamples },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
