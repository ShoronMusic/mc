/**
 * Lady Gaga, Bruno Mars / Die With A Smile の誤登録（曲名が "Die" のみ）を修正（1回限り）
 * Usage: npx tsx scripts/fix-die-with-a-smile-gaga-mars-title-once.ts [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSongDisplayTitle } from '@/lib/music8-canonical-artist-name';

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

const MAIN_ARTIST = 'Lady Gaga, Bruno Mars';
const SONG_TITLE = 'Die With A Smile';

async function main(): Promise<void> {
  loadDotEnvLocal();
  const apply = process.argv.includes('--apply');
  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient failed');
    process.exit(1);
  }

  const displayTitle = buildSongDisplayTitle(MAIN_ARTIST, SONG_TITLE);

  const { data: bySlug, error: e1 } = await admin
    .from('songs')
    .select('id, main_artist, song_title, display_title, music8_song_slug')
    .eq('music8_song_slug', 'die-with-a-smile');

  if (e1) throw new Error(e1.message);

  const { data: byWrongTitle, error: e2 } = await admin
    .from('songs')
    .select('id, main_artist, song_title, display_title, music8_song_slug')
    .eq('display_title', 'Lady Gaga, Bruno Mars - Die');

  if (e2) throw new Error(e2.message);

  const seen = new Set<string>();
  const candidates = [...(bySlug ?? []), ...(byWrongTitle ?? [])].filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    const st = (r.song_title ?? '').trim();
    const dt = (r.display_title ?? '').trim();
    return st === 'Die' || dt === 'Lady Gaga, Bruno Mars - Die';
  });

  console.log('candidates:', candidates.length);
  for (const r of candidates) {
    console.log(JSON.stringify(r));
  }

  const { data: existingCorrect } = await admin
    .from('songs')
    .select('id, display_title')
    .ilike('display_title', displayTitle)
    .maybeSingle();

  if (existingCorrect && candidates.some((c) => c.id !== existingCorrect.id)) {
    console.log('WARNING: correct row already exists:', existingCorrect);
    console.log('Abort — merge song_videos manually if needed.');
    process.exit(1);
  }

  const payload = {
    main_artist: MAIN_ARTIST,
    song_title: SONG_TITLE,
    display_title: displayTitle,
  };

  for (const row of candidates) {
    console.log(`${apply ? 'apply' : 'dry'} update ${row.id}:`, payload);
    if (apply) {
      const { error: uErr } = await admin.from('songs').update(payload).eq('id', row.id);
      if (uErr) console.error('  ERROR:', uErr.message);
      else console.log('  ok');
    }
  }

  if (apply && candidates.length > 0) {
    const { data: verify } = await admin
      .from('songs')
      .select('id, main_artist, song_title, display_title')
      .in(
        'id',
        candidates.map((c) => c.id),
      );
    console.log('verify:', JSON.stringify(verify, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
