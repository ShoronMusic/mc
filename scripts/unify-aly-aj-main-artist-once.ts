/**
 * Aly & AJ 表記ゆれを `Aly & Aj` に統一（songs.main_artist / display_title / artists.name）
 * Usage: npx tsx scripts/unify-aly-aj-main-artist-once.ts [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSongDisplayTitle } from '@/lib/music8-canonical-artist-name';
import { clearLibraryArtistIndexCache } from '@/lib/build-library-artist-index';

const CANONICAL = 'Aly & Aj';
const CANONICAL_SLUG = 'aly-aj';

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

function compactAlyAjKey(name: string): string {
  return name
    .replace(/&amp;/gi, '&')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isAlyAjVariant(name: string): boolean {
  const k = compactAlyAjKey(name);
  return k === 'alyaj' || k === 'alyandaj';
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
  if (!admin) {
    console.error('createAdminClient failed');
    process.exit(1);
  }

  const { data: songRows, error: songErr } = await admin
    .from('songs')
    .select('id, main_artist, song_title, display_title, music8_artist_slug, artist_id')
    .or(
      [
        'main_artist.ilike.%aly%aj%',
        'main_artist.ilike.%aly%&%',
        'music8_artist_slug.eq.aly-aj',
      ].join(','),
    )
    .limit(500);
  if (songErr) throw new Error(songErr.message);

  const songTargets = (songRows ?? []).filter((r) => {
    const ma = (r.main_artist ?? '').trim();
    const slug = (r.music8_artist_slug ?? '').trim().toLowerCase();
    if (slug === CANONICAL_SLUG) return ma !== CANONICAL;
    return isAlyAjVariant(ma) && ma !== CANONICAL;
  });

  console.log(`song targets: ${songTargets.length}`);
  for (const r of songTargets) {
    const songTitle = (r.song_title ?? '').trim();
    const payload: Record<string, string> = {
      main_artist: CANONICAL,
      display_title: fixDisplayTitle(r.display_title ?? '', songTitle),
      music8_artist_slug: CANONICAL_SLUG,
    };
    console.log(`${apply ? 'apply' : 'dry'} song ${r.id}: ${JSON.stringify(r.main_artist)} ->`, payload);
    if (apply) {
      const { error: uErr } = await admin.from('songs').update(payload).eq('id', r.id);
      if (uErr) console.error('  ERROR:', uErr.message);
    }
  }

  const { data: artists, error: artistErr } = await admin
    .from('artists')
    .select('id, name, music8_artist_slug')
    .or('name.ilike.%aly%aj%,name.ilike.%aly%&%aj%,music8_artist_slug.eq.aly-aj');
  if (artistErr) throw new Error(artistErr.message);

  const artistRows = (artists ?? []).filter((a) => {
    const slug = (a.music8_artist_slug ?? '').trim().toLowerCase();
    if (slug === CANONICAL_SLUG) return true;
    return isAlyAjVariant(a.name ?? '');
  });
  console.log('\nartist rows:', artistRows.length);
  for (const a of artistRows) console.log(JSON.stringify(a));

  const canonical =
    artistRows.find((a) => (a.music8_artist_slug ?? '').trim().toLowerCase() === CANONICAL_SLUG) ??
    artistRows.find((a) => (a.name ?? '').trim() === CANONICAL);

  if (!canonical?.id) {
    console.error('canonical artist aly-aj not found');
    process.exit(1);
  }

  if (apply) {
    const dupes = artistRows.filter((a) => a.id !== canonical.id);
    for (const d of dupes) {
      const { data: creds } = await admin.from('song_credits').select('song_id').eq('artist_id', d.id).limit(5);
      const { data: still } = await admin.from('songs').select('id').eq('artist_id', d.id).limit(1);
      if ((creds ?? []).length) {
        for (const c of creds ?? []) {
          const { error: cErr } = await admin
            .from('song_credits')
            .update({ artist_id: canonical.id })
            .eq('song_id', c.song_id)
            .eq('artist_id', d.id);
          if (cErr) console.error('  credit reassign ERROR:', cErr.message);
        }
      }
      const { data: credsAfter } = await admin.from('song_credits').select('song_id').eq('artist_id', d.id).limit(1);
      if ((still ?? []).length || (credsAfter ?? []).length) {
        console.log(`skip delete artist ${d.id} (${d.name}): still referenced`);
        continue;
      }
      const { error: delErr } = await admin.from('artists').delete().eq('id', d.id);
      console.log(`delete duplicate artist ${JSON.stringify(d.name)}:`, delErr?.message ?? 'ok');
    }

    if ((canonical.name ?? '').trim() !== CANONICAL) {
      const { error: nErr } = await admin.from('artists').update({ name: CANONICAL }).eq('id', canonical.id);
      console.log('rename canonical artist:', nErr?.message ?? `${canonical.name} -> ${CANONICAL}`);
    }

    await admin.from('songs').update({ artist_id: canonical.id }).eq('music8_artist_slug', CANONICAL_SLUG);
    await admin.from('songs').update({ artist_id: canonical.id }).eq('main_artist', CANONICAL);

    clearLibraryArtistIndexCache();
    console.log('cleared library artist index cache');
  }

  const { data: counts } = await admin.from('songs').select('id').eq('main_artist', CANONICAL);
  console.log(`\nmain_artist=${CANONICAL} song rows: ${counts?.length ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
