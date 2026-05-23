/**
 * main_artist の A-ha / A-Ha 等を a-ha に統一（songs + display_title 先頭）
 * Usage: npx tsx scripts/unify-a-ha-main-artist-once.ts [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSongDisplayTitle } from '@/lib/music8-canonical-artist-name';

const CANONICAL = 'a-ha';

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

function isAhaVariant(artist: string): boolean {
  const n = artist.trim().toLowerCase().replace(/\s+/g, '');
  return n === 'a-ha' || n === 'aha';
}

function fixDisplayTitle(displayTitle: string, songTitle: string): string {
  const dt = displayTitle.trim();
  const sep = ' - ';
  const idx = dt.indexOf(sep);
  if (idx > 0) {
    const titlePart = dt.slice(idx + sep.length).trim() || songTitle.trim();
    return buildSongDisplayTitle(CANONICAL, titlePart);
  }
  return buildSongDisplayTitle(CANONICAL, songTitle.trim() || dt);
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const apply = process.argv.includes('--apply');
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from('songs')
    .select('id, main_artist, song_title, display_title, music8_artist_slug')
    .or('main_artist.ilike.A-ha,main_artist.ilike.A - Ha,main_artist.eq.A');

  if (error) throw new Error(error.message);

  const targets = (rows ?? []).filter((r) => {
    const ma = (r.main_artist ?? '').trim();
    if (!ma) return false;
    if (ma === CANONICAL) return false;
    return isAhaVariant(ma) || ma === 'A' || /^a\s*-\s*ha$/i.test(ma);
  });

  console.log(`targets: ${targets.length}`);
  for (const r of targets) {
    const songTitle = (r.song_title ?? '').trim();
    const displayTitle = fixDisplayTitle(r.display_title ?? '', songTitle);
    const payload = {
      main_artist: CANONICAL,
      display_title: displayTitle,
    };
    console.log(`${apply ? 'apply' : 'dry'} ${r.id}: ${r.main_artist} | ${r.display_title} ->`, payload);
    if (apply) {
      const { error: uErr } = await admin.from('songs').update(payload).eq('id', r.id);
      if (uErr) console.error('  ERROR:', uErr.message);
    }
  }

  // artists テーブル: A-ha 名義を a-ha に寄せ（重複は手動確認）
  const { data: artists } = await admin
    .from('artists')
    .select('id, name, music8_artist_slug')
    .or('name.ilike.A-ha,name.ilike.a-ha,music8_artist_slug.eq.a-ha');

  console.log('\nartists rows:', artists?.length ?? 0);
  for (const a of artists ?? []) {
    console.log(JSON.stringify(a));
    if (apply && (a.name ?? '').trim() !== CANONICAL && isAhaVariant(a.name ?? '')) {
      const { error: aErr } = await admin.from('artists').update({ name: CANONICAL }).eq('id', a.id);
      if (aErr) console.error('  artist rename ERROR:', aErr.message);
      else console.log('  artist renamed -> a-ha');
    }
  }

  if (apply) {
    const { data: artistRows } = await admin
      .from('artists')
      .select('id, name, music8_artist_slug')
      .or('name.ilike.a-ha,name.ilike.a ha,music8_artist_slug.eq.a-ha');

    const canonical =
      (artistRows ?? []).find((a) => (a as { music8_artist_slug?: string }).music8_artist_slug === 'a-ha') ??
      (artistRows ?? []).find((a) => (a.name ?? '').trim() === CANONICAL);

    if (canonical?.id) {
      await admin.from('songs').update({ artist_id: canonical.id }).eq('main_artist', CANONICAL);
      console.log(`linked all a-ha songs -> artist_id ${canonical.id}`);
    }

    const dupes = (artistRows ?? []).filter((a) => a.id !== canonical?.id);
    for (const d of dupes) {
      const { data: still } = await admin.from('songs').select('id').eq('artist_id', d.id).limit(1);
      if (still?.length) {
        console.log(`skip delete artist ${d.id} (${d.name}): still referenced`);
        continue;
      }
      const { error: delErr } = await admin.from('artists').delete().eq('id', d.id);
      console.log(`delete duplicate artist ${d.name}:`, delErr?.message ?? 'ok');
    }

    if (canonical?.id && (canonical.name ?? '').trim() !== CANONICAL) {
      const { error: nErr } = await admin.from('artists').update({ name: CANONICAL }).eq('id', canonical.id);
      console.log('rename canonical artist:', nErr?.message ?? 'ok');
    }
  }

  const { data: counts } = await admin.from('songs').select('main_artist').eq('main_artist', CANONICAL);
  console.log(`\nmain_artist=a-ha song rows: ${counts?.length ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
