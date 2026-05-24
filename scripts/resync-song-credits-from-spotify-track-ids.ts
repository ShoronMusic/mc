/**
 * spotify_track_id がある曲を Spotify トラック API で再取得し、
 * 全アーティストを artists 補完 + song_credits 再同期する。
 *
 * Usage:
 *   npx tsx scripts/resync-song-credits-from-spotify-track-ids.ts
 *   npx tsx scripts/resync-song-credits-from-spotify-track-ids.ts --apply
 *   npx tsx scripts/resync-song-credits-from-spotify-track-ids.ts --apply --song-ids=uuid1,uuid2
 *   npx tsx scripts/resync-song-credits-from-spotify-track-ids.ts --apply --manual-patch-2026-05-24
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  resolveArtistIdFromIndex,
  type ArtistLookupIndex,
} from '@/lib/song-credits-resolve';
import {
  clearArtistLookupIndexCache,
  loadArtistLookupIndex,
  syncSongCreditsFromSongId,
  songCreditsTableAvailable,
} from '@/lib/song-credits-sync';
import {
  fetchSpotifyArtistsByIds,
  fetchSpotifyTrackWithArtistsById,
  getSpotifyAccessToken,
} from '@/lib/spotify-search-track';

/** 2026-05-24 手作業で spotify_track_id を付与した曲 */
const MANUAL_PATCH_TRACK_SONG_IDS = [
  '07a55af0-b5a7-49bb-96d3-bbf8f3126da6', // Dayton
  '8e7985c5-3e8c-4e99-b8c9-073d11f1237e', // Dagny
  'bbab239f-ac0b-4ae7-9f86-8b1c6855be53', // KAS:ST
  'd1a92cff-f2a0-4c45-9b50-5bce079a35d9', // A$AP Rocky
  'eecd6ea6-dd88-469e-bc44-5bb82ac37a40', // Aerosmith
];

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

function parseArgs(argv: string[]) {
  const songIdsRaw = argv.find((t) => t.startsWith('--song-ids='))?.slice('--song-ids='.length) ?? '';
  const songIds = songIdsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const manualPatch = argv.includes('--manual-patch-2026-05-24');
  const delayMs = Math.max(0, Number(argv.find((t) => t.startsWith('--delay-ms='))?.slice(11) || '350') || 350);
  return {
    apply: argv.includes('--apply'),
    songIds: songIds.length > 0 ? songIds : manualPatch ? MANUAL_PATCH_TRACK_SONG_IDS : [],
    allWithTrackId: argv.includes('--all-with-track-id'),
    delayMs,
  };
}

async function findArtistIdBySpotifyId(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  spotifyId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('artists')
    .select('id')
    .eq('spotify_artist_id', spotifyId)
    .limit(1);
  if (error?.code === '42703') return null;
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as { id?: string } | undefined)?.id?.trim() ?? null;
}

async function upsertArtistFromSpotify(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  meta: { id: string; name: string; popularity: number | null; images: string | null },
  apply: boolean,
): Promise<void> {
  const existing = await findArtistIdBySpotifyId(admin, meta.id);
  if (existing) return;

  if (!apply) return;

  const payload: Record<string, unknown> = {
    name: meta.name,
    spotify_artist_id: meta.id,
  };
  if (meta.images) payload.spotify_artist_images = meta.images;
  if (meta.popularity != null) payload.spotify_artist_popularity = meta.popularity;

  const { error } = await admin.from('artists').insert(payload);
  if (error?.code === '23505') return;
  if (error) throw error;
}

async function ensureTrackArtistsInDb(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  index: ArtistLookupIndex,
  track: Awaited<ReturnType<typeof fetchSpotifyTrackWithArtistsById>>,
  apply: boolean,
): Promise<void> {
  if (!track.artists.length) return;

  const details = await fetchSpotifyArtistsByIds(track.artists.map((a) => a.id));
  const detailById = new Map(details.map((d) => [d.id, d]));

  for (const ref of track.artists) {
    const detail = detailById.get(ref.id) ?? {
      id: ref.id,
      name: ref.name,
      popularity: null,
      images: null,
    };
    const existingId =
      (await findArtistIdBySpotifyId(admin, detail.id)) ??
      resolveArtistIdFromIndex(index, detail.name, null);
    if (existingId) continue;
    await upsertArtistFromSpotify(admin, detail, apply);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { apply, songIds, allWithTrackId, delayMs } = parseArgs(process.argv.slice(2));

  const admin = createAdminClient();
  if (!admin || !(await songCreditsTableAvailable(admin))) {
    console.error('admin / song_credits unavailable');
    process.exit(1);
  }
  if (apply && !(await getSpotifyAccessToken())) {
    console.error('SPOTIFY credentials missing');
    process.exit(1);
  }

  let targetIds = songIds;
  if (allWithTrackId) {
    targetIds = [];
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin
        .from('songs')
        .select('id, spotify_track_id')
        .not('spotify_track_id', 'is', null)
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      if (!data?.length) break;
      for (const row of data) {
        const id = (row as { id?: string }).id?.trim();
        const tid = (row as { spotify_track_id?: string }).spotify_track_id?.trim();
        if (id && tid) targetIds.push(id);
      }
      if (data.length < PAGE) break;
    }
  }

  if (targetIds.length === 0) {
    console.error(
      '対象 song_id がありません。--manual-patch-2026-05-24 または --song-ids=... または --all-with-track-id を指定してください。',
    );
    process.exit(1);
  }

  const { data: songs, error: fetchErr } = await admin
    .from('songs')
    .select('id, display_title, spotify_track_id, spotify_artists, main_artist')
    .in('id', targetIds);
  if (fetchErr) throw fetchErr;

  const rows = (songs ?? []).filter((s) => (s as { spotify_track_id?: string }).spotify_track_id?.trim());
  const results: Record<string, unknown>[] = [];

  clearArtistLookupIndexCache();
  let index = await loadArtistLookupIndex(admin);

  for (const row of rows) {
    const songId = (row as { id: string }).id;
    const displayTitle = (row as { display_title?: string }).display_title ?? '';
    const trackId = (row as { spotify_track_id: string }).spotify_track_id.trim();

    const track = await fetchSpotifyTrackWithArtistsById(trackId);
    if (!track.artists.length) {
      results.push({
        song_id: songId,
        display_title: displayTitle,
        spotify_track_id: trackId,
        status: 'spotify_api_no_artists',
      });
      continue;
    }

    const artistNames = track.artists.map((a) => a.name);
    await ensureTrackArtistsInDb(admin, index, track, apply);

    if (apply) {
      const songUpdate: Record<string, unknown> = {
        spotify_artists: track.spotifyArtists ?? artistNames.join(', '),
      };
      if (track.spotifyName) songUpdate.spotify_name = track.spotifyName;
      if (track.spotifyPopularity != null) {
        songUpdate.spotify_popularity = Math.round(track.spotifyPopularity);
      }
      if (track.spotifyReleaseDate) songUpdate.spotify_release_date = track.spotifyReleaseDate;
      if (artistNames[0]) songUpdate.main_artist = artistNames[0];

      const { error: uErr } = await admin.from('songs').update(songUpdate).eq('id', songId);
      if (uErr) throw uErr;

      clearArtistLookupIndexCache();
      index = await loadArtistLookupIndex(admin);
    }

    const sync = apply
      ? await syncSongCreditsFromSongId(admin, songId, true, index)
      : null;

    results.push({
      song_id: songId,
      display_title: displayTitle,
      spotify_track_id: trackId,
      spotify_api_artists: artistNames,
      credit_count: sync?.creditCount ?? artistNames.length,
      unresolved: sync?.unresolved ?? [],
      applied: apply,
    });

    if (delayMs > 0) await sleep(delayMs);
  }

  const outDir = path.resolve(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(
    outDir,
    `resync-spotify-track-ids-${apply ? 'apply' : 'dry'}-${stamp}.json`,
  );
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        target_count: targetIds.length,
        with_track_id: rows.length,
        report: reportPath,
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
