/**
 * コラボ曲の main_artist / music8_artist_slug / display_title / song_credits を
 * Music8 曲 JSON（video_id + slug 候補）の spotify 順に合わせる。
 *
 * Usage:
 *   npx tsx scripts/backfill-songs-multi-artist-from-music8.ts
 *   npx tsx scripts/backfill-songs-multi-artist-from-music8.ts --apply
 *   npx tsx scripts/backfill-songs-multi-artist-from-music8.ts --apply --ids-from-csv=tmp/music8-songs-json-not-found.csv
 *   npx tsx scripts/backfill-songs-multi-artist-from-music8.ts --apply --limit=100
 *   npx tsx scripts/backfill-songs-multi-artist-from-music8.ts --apply --video-id-fallback --ids-from-csv=tmp/backfill-multi-artist-no-json.csv
 *   npx tsx scripts/backfill-songs-multi-artist-from-music8.ts --apply --video-id-fallback --artists-local-dir=E:\m8\public\data\artists --songs-local-dir=E:\m8\public\data\songs
 *   npx tsx scripts/backfill-songs-multi-artist-from-music8.ts --apply --video-id-fallback --skip-display-title --ids-from-csv=tmp/backfill-multi-artist-failed.csv
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSongDisplayTitle } from '@/lib/music8-canonical-artist-name';
import { extractMusic8SongArtistsForDisplay } from '@/lib/music8-song-artists-display';
import { parseSpotifyArtistsString } from '@/lib/song-credits-resolve';
import {
  loadMusic8WpSongsVideoIndexForScripts,
  resolveMusic8WpSongJsonForRow,
  type Music8SongRowForJsonResolve,
} from '@/lib/music8-wp-song-json-resolve';
import type { Music8WpSongsVideoIndex } from '@/lib/music8-wp-songs-video-index';
import {
  clearArtistLookupIndexCache,
  loadArtistLookupIndex,
  planSongCreditDbRows,
  songCreditsTableAvailable,
  type SongCreditDbRow,
} from '@/lib/song-credits-sync';

const PAGE = 200;

type SongRow = Music8SongRowForJsonResolve & {
  id: string;
  display_title: string | null;
};

type CliOptions = {
  apply: boolean;
  limit: number | null;
  idsFromCsv: string | null;
  sleepMs: number;
  progressEvery: number;
  videoIdFallback: boolean;
  songsLocalDir: string | null;
  artistsLocalDir: string | null;
  videoIndexIn: string | null;
  videoIndexOut: string | null;
  skipDisplayTitle: boolean;
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
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) args.set(token.slice(2, eq).trim(), token.slice(eq + 1).trim());
  }
  const limitRaw = args.get('limit');
  const limitNum = limitRaw ? Number.parseInt(limitRaw, 10) : NaN;
  const sleepNum = Number.parseInt(args.get('sleep-ms') ?? '20', 10);
  const progressNum = Number.parseInt(args.get('progress-every') ?? '50', 10);
  return {
    apply: argv.includes('--apply'),
    limit: Number.isFinite(limitNum) && limitNum > 0 ? limitNum : null,
    idsFromCsv: args.get('ids-from-csv')?.trim() || null,
    sleepMs: Number.isFinite(sleepNum) && sleepNum >= 0 ? sleepNum : 20,
    progressEvery: Number.isFinite(progressNum) && progressNum > 0 ? progressNum : 50,
    videoIdFallback: argv.includes('--video-id-fallback'),
    songsLocalDir: args.get('songs-local-dir')?.trim() || null,
    artistsLocalDir: args.get('artists-local-dir')?.trim() || null,
    videoIndexIn: args.get('video-index-in')?.trim() || null,
    videoIndexOut: args.get('video-index-out')?.trim() || null,
    skipDisplayTitle: argv.includes('--skip-display-title'),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normName(s: string): string {
  return s.trim().toLowerCase();
}

function readSongIdsFromCsv(csvPath: string): Set<string> {
  const abs = path.resolve(csvPath);
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/).filter(Boolean);
  const ids = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (i === 0 && line.toLowerCase().startsWith('id,')) continue;
    const id = line.split(',')[0]?.trim();
    if (id && id !== 'id') ids.add(id);
  }
  return ids;
}

function spotifyArtistsFromRow(row: SongRow): string | null {
  const top = (row.spotify_artists ?? '').trim();
  if (top) return top;
  const data = row.music8_song_data;
  if (data != null && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const fromSnap = typeof o.spotify_artists === 'string' ? o.spotify_artists.trim() : '';
    if (fromSnap) return fromSnap;
  }
  return null;
}

function rankVariant(variant: string | null | undefined): number {
  const v = (variant ?? '').trim().toLowerCase();
  if (v === 'official') return 0;
  if (v === 'topic') return 1;
  if (v === 'lyric') return 2;
  if (v === 'live') return 3;
  if (v) return 4;
  return 5;
}

async function fetchVideoId(admin: NonNullable<ReturnType<typeof createAdminClient>>, songId: string): Promise<string | null> {
  const { data } = await admin
    .from('song_videos')
    .select('video_id, variant, created_at')
    .eq('song_id', songId);
  let best: { videoId: string; rank: number; createdAt: string } | null = null;
  for (const row of data ?? []) {
    const cast = row as { video_id?: string; variant?: string | null; created_at?: string };
    const videoId = (cast.video_id ?? '').trim();
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) continue;
    const rank = rankVariant(cast.variant);
    const createdAt = (cast.created_at ?? '').trim();
    if (!best || rank < best.rank || (rank === best.rank && createdAt > best.createdAt)) {
      best = { videoId, rank, createdAt };
    }
  }
  return best?.videoId ?? null;
}

async function insertCreditRowsBatched(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  rows: SongCreditDbRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const INS = 200;
  for (let i = 0; i < rows.length; i += INS) {
    const slice = rows.slice(i, i + INS);
    const { error } = await admin.from('song_credits').insert(slice);
    if (error) throw error;
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  const admin = createAdminClient();
  if (!admin) throw new Error('createAdminClient failed');
  if (!(await songCreditsTableAvailable(admin))) {
    throw new Error('song_credits table missing');
  }

  clearArtistLookupIndexCache();
  const index = await loadArtistLookupIndex(admin);

  const idsFilter = opts.idsFromCsv ? readSongIdsFromCsv(opts.idsFromCsv) : null;
  const videoIndex: Music8WpSongsVideoIndex | null = opts.videoIdFallback
    ? await loadMusic8WpSongsVideoIndexForScripts({
        videoIndexIn: opts.videoIndexIn,
        songsLocalDir: opts.songsLocalDir,
        videoIndexOut: opts.videoIndexOut,
        onBuildProgress: ({ scanned, indexed, conflicts }) => {
          console.log(`[video-index] scanned=${scanned} indexed=${indexed} conflicts=${conflicts}`);
        },
      })
    : null;

  console.log(
    `[multi-artist] mode=${opts.apply ? 'APPLY' : 'dry-run'} ids=${idsFilter?.size ?? 'all-multi-spotify'} video_fallback=${opts.videoIdFallback}`,
  );

  let scanned = 0;
  let candidates = 0;
  let updated = 0;
  let skipped = 0;
  let noJson = 0;
  let videoResolved = 0;
  let artistSongsResolved = 0;
  let failed = 0;
  let offset = 0;

  for (;;) {
    if (opts.limit != null && scanned >= opts.limit) break;

    let q = admin
      .from('songs')
      .select(
        'id, main_artist, song_title, display_title, music8_artist_slug, music8_song_slug, music8_song_id, music8_video_id, spotify_artists, music8_song_data',
      );

    if (idsFilter && idsFilter.size > 0) {
      if (offset > 0) break;
      q = q.in('id', [...idsFilter]);
    } else {
      q = q
        .not('spotify_artists', 'is', null)
        .like('spotify_artists', '%,%')
        .order('display_title', { ascending: true });
    }

    const { data: batch, error } = await q.range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!batch?.length) break;
    offset += PAGE;

    for (const raw of batch as SongRow[]) {
      if (opts.limit != null && scanned >= opts.limit) break;
      if (idsFilter && !idsFilter.has(raw.id)) continue;
      scanned++;

      const videoId = await fetchVideoId(admin, raw.id);
      const fetched = await resolveMusic8WpSongJsonForRow(raw, {
        videoId,
        videoIdFallback: opts.videoIdFallback,
        songsLocalDir: opts.songsLocalDir,
        artistsLocalDir: opts.artistsLocalDir,
        videoIndex,
      });
      if (opts.sleepMs > 0) await sleep(opts.sleepMs);
      if (!fetched) {
        noJson++;
        continue;
      }
      if (fetched.resolvedVia === 'artist-songs-list') {
        artistSongsResolved++;
        console.log(
          `[artist-songs] ${(raw.display_title ?? raw.id).trim()} -> ${fetched.canonicalArtistSlug}_${fetched.songSlug}`,
        );
      } else if (fetched.resolvedVia !== 'slug') {
        videoResolved++;
        console.log(
          `[video-resolve] ${(raw.display_title ?? raw.id).trim()} via=${fetched.resolvedVia} slug=${fetched.canonicalArtistSlug}/${fetched.songSlug}`,
        );
      }

      const artists = extractMusic8SongArtistsForDisplay(fetched.json, fetched.canonicalArtistSlug);
      if (artists.length === 0) {
        skipped++;
        continue;
      }

      const multiArtist = artists.length >= 2;
      const nextMain = artists[0]!.name;
      const songTitle = (raw.song_title ?? '').trim();
      const nextDisplay = buildSongDisplayTitle(nextMain, songTitle);
      const nextSlug = artists[0]!.slug ?? fetched.canonicalArtistSlug;
      const nextSongSlug = fetched.songSlug;
      const curMain = (raw.main_artist ?? '').trim();

      const planned = planSongCreditDbRows(
        raw.id,
        {
          explicitCreditArtists: artists.map((a) => a.name),
          spotify_artists: spotifyArtistsFromRow(raw),
          main_artist: nextMain,
          music8_song_data: raw.music8_song_data as Record<string, unknown> | null,
        },
        index,
      );

      const needsMain = curMain && normName(curMain) !== normName(nextMain);
      const needsSlug = (raw.music8_artist_slug ?? '').toLowerCase() !== (nextSlug ?? '').toLowerCase();
      const needsSongSlug =
        (raw.music8_song_slug ?? '').toLowerCase() !== (nextSongSlug ?? '').toLowerCase();
      const needsCredits = multiArtist && planned.creditCount >= 2;
      if (!needsMain && !needsSlug && !needsSongSlug && !needsCredits) {
        skipped++;
        continue;
      }

      candidates++;
      console.log(
        `[candidate] ${(raw.display_title ?? raw.id).trim()} main: ${curMain || '—'} -> ${nextMain} slug: ${raw.music8_artist_slug ?? '—'} -> ${nextSlug ?? '—'} song_slug: ${raw.music8_song_slug ?? '—'} -> ${nextSongSlug ?? '—'} credits=${multiArtist ? planned.creditCount : 0}${multiArtist ? '' : ' (slug-only)'}`,
      );

      if (!opts.apply) {
        updated++;
        continue;
      }

      try {
        const songPatch: Record<string, unknown> = {};
        if (needsMain) {
          songPatch.main_artist = nextMain;
          if (nextDisplay && !opts.skipDisplayTitle) songPatch.display_title = nextDisplay;
        }
        if (needsSlug && nextSlug) songPatch.music8_artist_slug = nextSlug;
        if (needsSongSlug && nextSongSlug) songPatch.music8_song_slug = nextSongSlug;
        if (planned.primaryArtistId) songPatch.artist_id = planned.primaryArtistId;

        if (Object.keys(songPatch).length > 0) {
          const { error: uErr } = await admin.from('songs').update(songPatch).eq('id', raw.id);
          if (uErr) throw uErr;
        }

        if (planned.rows.length > 0 && multiArtist) {
          await admin.from('song_credits').delete().eq('song_id', raw.id);
          await insertCreditRowsBatched(admin, planned.rows);
        }
        updated++;
      } catch (e) {
        failed++;
        console.error(`[multi-artist] failed ${raw.id}`, e);
      }

      if (scanned % opts.progressEvery === 0) {
        console.log(
          `[progress] scanned=${scanned} candidates=${candidates} updated=${updated} skipped=${skipped} no_json=${noJson} video_resolved=${videoResolved} artist_songs=${artistSongsResolved}`,
        );
      }
    }
  }

  console.log(
    `[multi-artist] done scanned=${scanned} candidates=${candidates} updated=${updated} skipped=${skipped} no_json=${noJson} video_resolved=${videoResolved} artist_songs=${artistSongsResolved} failed=${failed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
