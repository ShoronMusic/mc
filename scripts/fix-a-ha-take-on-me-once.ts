/**
 * a-ha / Take On Me の誤登録（A / Ha - Take On Me）を修正（1回限り）
 * Usage: npx tsx scripts/fix-a-ha-take-on-me-once.ts [--apply]
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

async function main(): Promise<void> {
  loadDotEnvLocal();
  const apply = process.argv.includes('--apply');
  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient failed');
    process.exit(1);
  }

  const { data: wrongRows, error } = await admin
    .from('songs')
    .select('id, main_artist, song_title, display_title, music8_song_slug, music8_artist_slug')
    .or(
      'display_title.ilike.A - Ha - Take On Me%,main_artist.eq.A,song_title.ilike.Ha - Take On Me%',
    );

  if (error) throw new Error(error.message);

  const candidates = (wrongRows ?? []).filter((r) => {
    const ma = (r.main_artist ?? '').trim();
    const st = (r.song_title ?? '').trim();
    const dt = (r.display_title ?? '').trim();
    return (
      ma === 'A' ||
      st.toLowerCase().startsWith('ha - take on me') ||
      dt.toLowerCase().includes('ha - take on me')
    );
  });

  console.log('candidates:', candidates.length);
  for (const r of candidates) {
    console.log(JSON.stringify(r));
  }

  const correctDisplay = buildSongDisplayTitle('a-ha', 'Take On Me');
  const { data: existingCorrect } = await admin
    .from('songs')
    .select('id, display_title')
    .ilike('display_title', correctDisplay)
    .maybeSingle();

  if (existingCorrect && candidates.length > 0) {
    console.log('WARNING: correct row already exists:', existingCorrect);
    console.log('May need merge (song_videos) instead of rename — not auto-merging.');
  }

  const mainArtist = 'a-ha';
  const songTitle = 'Take On Me';
  const displayTitle = correctDisplay;

  for (const row of candidates) {
    const payload = { main_artist: mainArtist, song_title: songTitle, display_title: displayTitle };
    console.log(`${apply ? 'apply' : 'dry'} update ${row.id}:`, payload);
    if (apply) {
      const { error: uErr } = await admin.from('songs').update(payload).eq('id', row.id);
      if (uErr) console.error('  ERROR:', uErr.message);
      else console.log('  ok');
    }
  }

  // artist_id を a-ha に紐づけ（あれば）
  if (apply && candidates.length > 0) {
    const { data: artist } = await admin
      .from('artists')
      .select('id, name')
      .or('name.ilike.a-ha,music8_artist_slug.eq.a-ha')
      .limit(5);
    const aha = (artist ?? []).find(
      (a) => (a.name ?? '').toLowerCase() === 'a-ha' || (a as { music8_artist_slug?: string }).music8_artist_slug === 'a-ha',
    );
    if (aha) {
      for (const row of candidates) {
        const { error: linkErr } = await admin.from('songs').update({ artist_id: aha.id }).eq('id', row.id);
        if (linkErr) console.warn('artist_id link', linkErr.message);
        else console.log(`linked artist_id ${aha.id} -> song ${row.id}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
