/**
 * music8_artist_slug 単位で The/A/An プレフィックスゆれのみを統一（曲行は削除しない）。
 *
 *   npx tsx scripts/normalize-songs-main-artist-from-music8.ts           # dry-run
 *   npx tsx scripts/normalize-songs-main-artist-from-music8.ts --apply
 *   npx tsx scripts/normalize-songs-main-artist-from-music8.ts --apply --slug=police
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  artistNameMatchKey,
  buildSongDisplayTitle,
  isPrefixOnlyArtistNameVariant,
  pickCanonicalFromPrefixVariants,
  shouldNormalizePrefixOnlyArtistName,
} from '@/lib/music8-canonical-artist-name';

type SongRow = {
  id: string;
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
  music8_artist_slug: string | null;
  artist_id: string | null;
};

type ArtistRow = {
  id: string;
  name: string;
  music8_artist_slug: string | null;
  profile_text: string | null;
};

type CliOptions = {
  apply: boolean;
  slugFilter: string | null;
  sleepMs: number;
};

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

function parseArgs(argv: string[]): CliOptions {
  let slugFilter: string | null = null;
  for (const token of argv) {
    if (token.startsWith('--slug=')) slugFilter = token.slice('--slug='.length).trim().toLowerCase() || null;
  }
  return {
    apply: argv.includes('--apply'),
    slugFilter,
    sleepMs: 80,
  };
}

function mostCommonName(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) {
    const t = n.trim();
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best = '';
  let max = 0;
  for (const [n, c] of counts) {
    if (c > max) {
      max = c;
      best = n;
    }
  }
  return best;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(`Usage:
  npx tsx scripts/normalize-songs-main-artist-from-music8.ts [--apply] [--slug=police]

  --apply   DB を更新（省略時は dry-run）
  --slug=   1 slug だけ処理`);
    return;
  }

  loadDotEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  const admin = createAdminClient();
  if (!admin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL が必要です。');
    process.exit(1);
  }

  const { data: artistRows, error: artErr } = await admin
    .from('artists')
    .select('id, name, music8_artist_slug, profile_text');
  if (artErr) throw artErr;
  const artistsBySlug = new Map<string, ArtistRow>();
  for (const a of (artistRows ?? []) as ArtistRow[]) {
    const slug = (a.music8_artist_slug ?? '').trim().toLowerCase();
    if (slug && !artistsBySlug.has(slug)) artistsBySlug.set(slug, a);
  }

  const PAGE = 1000;
  let off = 0;
  const allSongs: SongRow[] = [];
  for (;;) {
    const { data, error } = await admin
      .from('songs')
      .select('id, main_artist, song_title, display_title, music8_artist_slug, artist_id')
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as SongRow[];
    if (!batch.length) break;
    allSongs.push(...batch);
    off += PAGE;
    if (batch.length < PAGE) break;
  }

  const displayTitleOwner = new Map<string, string>();
  for (const s of allSongs) {
    const dt = (s.display_title ?? '').trim().toLowerCase();
    if (dt) displayTitleOwner.set(dt, s.id);
  }

  const bySlug = new Map<string, SongRow[]>();
  for (const s of allSongs) {
    const slug = (s.music8_artist_slug ?? '').trim().toLowerCase();
    if (!slug) continue;
    if (opts.slugFilter && slug !== opts.slugFilter) continue;
    const arr = bySlug.get(slug) ?? [];
    arr.push(s);
    bySlug.set(slug, arr);
  }

  type PlannedUpdate = {
    id: string;
    slug: string;
    fromArtist: string;
    toArtist: string;
    fromDisplay: string;
    toDisplay: string;
    artistId: string | null;
  };

  const updates: PlannedUpdate[] = [];
  const skippedGroups: Array<{ slug: string; reason: string; names: string[] }> = [];
  const collisions: PlannedUpdate[] = [];
  const canonicalCache = new Map<string, string | null>();
  let slugIndex = 0;

  for (const [slug, songs] of bySlug) {
    slugIndex += 1;
    if (slugIndex % 500 === 0) {
      console.error(`[progress] slug groups ${slugIndex}/${bySlug.size}`);
    }
    const distinctNames = [...new Set(songs.map((s) => (s.main_artist ?? '').trim()).filter(Boolean))];
    if (distinctNames.length === 0) continue;

    if (!isPrefixOnlyArtistNameVariant(distinctNames)) {
      skippedGroups.push({ slug, reason: 'not_prefix_only', names: distinctNames });
      continue;
    }

    if (!canonicalCache.has(slug)) {
      const masterName = artistsBySlug.get(slug)?.name?.trim() ?? null;
      canonicalCache.set(slug, masterName ?? pickCanonicalFromPrefixVariants(distinctNames));
    }
    const canonical = canonicalCache.get(slug) ?? null;

    if (!canonical) {
      skippedGroups.push({ slug, reason: 'no_canonical', names: distinctNames });
      continue;
    }

    const master = artistsBySlug.get(slug);
    const artistId = master?.id ?? null;

    for (const s of songs) {
      const cur = (s.main_artist ?? '').trim();
      if (!cur || cur === canonical) continue;
      if (!shouldNormalizePrefixOnlyArtistName(cur, canonical)) continue;

      const title = (s.song_title ?? '').trim() || (s.display_title ?? '').split(' - ').slice(1).join(' - ').trim();
      const toDisplay = buildSongDisplayTitle(canonical, title);
      const fromDisplay = (s.display_title ?? '').trim();
      const key = toDisplay.toLowerCase();
      const owner = displayTitleOwner.get(key);
      if (owner && owner !== s.id) {
        const titleNorm = title.toLowerCase();
        const { data: ownerRow } = await admin
          .from('songs')
          .select('id, song_title, display_title, music8_artist_slug')
          .eq('id', owner)
          .maybeSingle();
        const ownerTitle = (
          (ownerRow?.song_title ?? '').trim() ||
          (ownerRow?.display_title ?? '').split(' - ').slice(1).join(' - ').trim()
        ).toLowerCase();
        if (ownerTitle === titleNorm) {
          collisions.push({
            id: s.id,
            slug,
            fromArtist: cur,
            toArtist: canonical,
            fromDisplay,
            toDisplay,
            artistId,
          });
          continue;
        }
      }

      updates.push({
        id: s.id,
        slug,
        fromArtist: cur,
        toArtist: canonical,
        fromDisplay,
        toDisplay,
        artistId,
      });
      displayTitleOwner.set(key, s.id);
    }
  }

  const processedSlugs = new Set(updates.map((u) => u.slug));
  const artistsToDelete: ArtistRow[] = [];
  for (const a of (artistRows ?? []) as ArtistRow[]) {
    const slug = (a.music8_artist_slug ?? '').trim().toLowerCase();
    if (slug) {
      const master = artistsBySlug.get(slug);
      if (master && a.id !== master.id) artistsToDelete.push(a);
      continue;
    }
    const key = artistNameMatchKey(a.name);
    for (const s of processedSlugs) {
      const master = artistsBySlug.get(s);
      if (master && key === artistNameMatchKey(master.name) && a.id !== master.id) {
        artistsToDelete.push(a);
        break;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: opts.apply ? 'apply' : 'dry-run',
        slugFilter: opts.slugFilter,
        songRows: allSongs.length,
        slugGroups: bySlug.size,
        plannedSongUpdates: updates.length,
        displayTitleCollisions: collisions.length,
        skippedSlugGroups: skippedGroups.length,
        duplicateArtistsToDelete: artistsToDelete.length,
      },
      null,
      2,
    ),
  );

  if (updates.length > 0) {
    console.log('\n更新予定 (先頭30件):');
    for (const u of updates.slice(0, 30)) {
      console.log(`  [${u.slug}] ${u.fromArtist} → ${u.toArtist} | ${u.fromDisplay} → ${u.toDisplay}`);
    }
  }
  if (collisions.length > 0) {
    console.log('\n衝突スキップ (先頭10件):');
    for (const c of collisions.slice(0, 10)) {
      console.log(`  ${c.id} ${c.toDisplay}`);
    }
  }
  if (skippedGroups.length > 0 && skippedGroups.length <= 25) {
    console.log('\nスキップした slug グループ:');
    for (const g of skippedGroups) {
      console.log(`  ${g.slug} (${g.reason}): ${g.names.join(' | ')}`);
    }
  } else if (skippedGroups.length > 25) {
    console.log(`\nスキップした slug グループ: ${skippedGroups.length} 件（not_prefix_only 等）`);
  }

  if (!opts.apply) {
    console.log('\n本番更新: npx tsx scripts/normalize-songs-main-artist-from-music8.ts --apply');
    return;
  }

  let merged = 0;
  for (const c of collisions) {
    const keepId = displayTitleOwner.get(c.toDisplay.toLowerCase());
    if (!keepId || keepId === c.id) continue;
    const { data: vids } = await admin
      .from('song_videos')
      .select('video_id, variant, performance_id')
      .eq('song_id', c.id);
    for (const v of vids ?? []) {
      await admin.from('song_videos').upsert(
        {
          song_id: keepId,
          video_id: v.video_id,
          variant: v.variant,
          performance_id: v.performance_id,
        },
        { onConflict: 'video_id' },
      );
    }
    const { error: delErr } = await admin.from('songs').delete().eq('id', c.id);
    if (delErr) {
      console.error(`[merge-fail] drop ${c.id}`, delErr.message);
    } else {
      merged += 1;
      console.log(`[merge] ${c.fromDisplay} -> keep ${keepId}`);
    }
    if (c.artistId) {
      await admin.from('songs').update({ artist_id: c.artistId }).eq('id', keepId);
    }
    const master = artistsBySlug.get(c.slug);
    if (master?.id) {
      await admin
        .from('songs')
        .update({
          main_artist: c.toArtist,
          music8_artist_slug: c.slug,
          artist_id: master.id,
        })
        .eq('id', keepId);
    }
  }

  let ok = 0;
  let fail = 0;
  for (const u of updates) {
    const patch: Record<string, unknown> = {
      main_artist: u.toArtist,
      display_title: u.toDisplay,
    };
    if (u.artistId) patch.artist_id = u.artistId;
    const { error } = await admin.from('songs').update(patch).eq('id', u.id);
    if (error) {
      fail += 1;
      console.error(`[update-fail] ${u.id}`, error.message);
    } else {
      ok += 1;
    }
  }

  let deleted = 0;
  for (const a of artistsToDelete) {
    const { count } = await admin
      .from('songs')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', a.id);
    if ((count ?? 0) > 0) {
      console.warn(`[artist-skip-delete] ${a.name} (${a.id}) still referenced by ${count} songs`);
      continue;
    }
    const { error } = await admin.from('artists').delete().eq('id', a.id);
    if (error) {
      console.error(`[artist-delete-fail] ${a.id}`, error.message);
    } else {
      deleted += 1;
      console.log(`[artist-deleted] ${JSON.stringify(a.name)}`);
    }
  }

  let repointed = 0;
  for (const [slug, songs] of bySlug) {
    const distinctNames = [...new Set(songs.map((s) => (s.main_artist ?? '').trim()).filter(Boolean))];
    if (!isPrefixOnlyArtistNameVariant(distinctNames)) continue;
    const master = artistsBySlug.get(slug);
    if (!master?.id) continue;
    if (!opts.apply) {
      repointed += songs.length;
      continue;
    }
    const { error: rpErr } = await admin
      .from('songs')
      .update({ artist_id: master.id })
      .eq('music8_artist_slug', slug);
    if (!rpErr) repointed += songs.length;
  }

  console.log(
    JSON.stringify(
      { songsMerged: merged, songsUpdated: ok, songsFailed: fail, artistsDeleted: deleted, artistIdRepointed: repointed },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
