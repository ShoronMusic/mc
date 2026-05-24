/**
 * needs-action（partial_unresolved）のうち spotify_track_id がある曲だけ、
 * Spotify トラック API でアーティストを取得し artists 補完＋song_credits 再同期を試す。
 *
 * Usage:
 *   npx tsx scripts/backfill-partial-artists-from-spotify-track.ts
 *   npx tsx scripts/backfill-partial-artists-from-spotify-track.ts --apply
 *   npx tsx scripts/backfill-partial-artists-from-spotify-track.ts --input=tmp/song-credits-needs-action-....jsonl
 *   npx tsx scripts/backfill-partial-artists-from-spotify-track.ts --limit=20
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
} from '@/lib/song-credits-sync';
import {
  fetchSpotifyArtistsByIds,
  fetchSpotifyTrackWithArtistsById,
  getSpotifyAccessToken,
} from '@/lib/spotify-search-track';

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

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

type NeedsRow = {
  song_id: string;
  display_title?: string | null;
  unresolved?: string[];
};

function parseArgs(argv: string[]) {
  let input = '';
  for (const token of argv) {
    if (token.startsWith('--input=')) input = token.slice('--input='.length);
  }
  const limitRaw = argv.find((t) => t.startsWith('--limit='))?.slice('--limit='.length);
  const limit =
    limitRaw != null && limitRaw !== '' ? Math.max(1, Math.min(5000, Number(limitRaw) || 1)) : null;
  return {
    apply: argv.includes('--apply'),
    input,
    limit,
    delayMs: Math.max(0, Number(argv.find((t) => t.startsWith('--delay-ms='))?.slice(11) || '400') || 400),
  };
}

function findLatestNeedsActionJsonl(): string | null {
  const dir = path.resolve(process.cwd(), 'tmp');
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('song-credits-needs-action-') && f.endsWith('.jsonl'))
    .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return files[0] ? path.join(dir, files[0].f) : null;
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
): Promise<'exists' | 'inserted' | 'updated' | 'dry'> {
  const existing = await findArtistIdBySpotifyId(admin, meta.id);
  if (existing) return 'exists';

  const { data: byName } = await admin
    .from('artists')
    .select('id, name, spotify_artist_id')
    .ilike('name', meta.name)
    .limit(5);
  const row = (byName ?? []).find(
    (r) => normName(String((r as { name?: string }).name ?? '')) === normName(meta.name),
  ) as { id?: string; spotify_artist_id?: string | null } | undefined;
  const nameId = row?.id?.trim();
  if (nameId) {
    if (!apply) return 'dry';
    const patch: Record<string, unknown> = { spotify_artist_id: meta.id };
    if (meta.images) patch.spotify_artist_images = meta.images;
    if (meta.popularity != null) patch.spotify_artist_popularity = meta.popularity;
    await admin.from('artists').update(patch).eq('id', nameId);
    return 'updated';
  }

  if (!apply) return 'dry';

  const payload: Record<string, unknown> = {
    name: meta.name,
    spotify_artist_id: meta.id,
  };
  if (meta.images) payload.spotify_artist_images = meta.images;
  if (meta.popularity != null) payload.spotify_artist_popularity = meta.popularity;

  const { error } = await admin.from('artists').insert(payload);
  if (error?.code === '23505') return 'exists';
  if (error) throw error;
  return 'inserted';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { apply, input, limit, delayMs } = parseArgs(process.argv.slice(2));

  const inputPath = input
    ? path.resolve(process.cwd(), input)
    : findLatestNeedsActionJsonl();
  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error('needs-action JSONL not found. Pass --input=tmp/song-credits-needs-action-....jsonl');
    process.exit(1);
  }

  const needsRows: NeedsRow[] = fs
    .readFileSync(inputPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as NeedsRow);

  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient failed');
    process.exit(1);
  }

  const token = await getSpotifyAccessToken();
  if (!token) {
    console.error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET が未設定です');
    process.exit(1);
  }

  let targets = needsRows;
  if (limit !== null) targets = targets.slice(0, limit);

  const ids = targets.map((r) => r.song_id);
  const songById = new Map<
    string,
    { display_title: string; spotify_track_id: string | null; spotify_artists: string | null }
  >();

  for (let i = 0; i < ids.length; i += 80) {
    const slice = ids.slice(i, i + 80);
    const { data, error } = await admin
      .from('songs')
      .select('id, display_title, spotify_track_id, spotify_artists')
      .in('id', slice);
    if (error) throw error;
    for (const s of data ?? []) {
      songById.set((s as { id: string }).id, {
        display_title: (s as { display_title?: string }).display_title ?? '',
        spotify_track_id: (s as { spotify_track_id?: string | null }).spotify_track_id ?? null,
        spotify_artists: (s as { spotify_artists?: string | null }).spotify_artists ?? null,
      });
    }
  }

  const withTrack = targets.filter((r) => songById.get(r.song_id)?.spotify_track_id?.trim());
  const noTrack = targets.length - withTrack.length;

  clearArtistLookupIndexCache();
  let index = await loadArtistLookupIndex(admin);

  const artistsToUpsertIds = new Set<string>();
  let songsFullFix = 0;
  let songsPartialRemain = 0;
  let apiErrors = 0;
  const samples: Record<string, unknown>[] = [];

  for (const row of withTrack) {
    const song = songById.get(row.song_id)!;
    const trackId = song.spotify_track_id!.trim();
    const unresolvedBefore = row.unresolved ?? [];

    const track = await fetchSpotifyTrackWithArtistsById(trackId);
    if (!track.artists.length) {
      apiErrors++;
      continue;
    }

    const artistIds = track.artists.map((a) => a.id);
    const details = await fetchSpotifyArtistsByIds(artistIds);
    const detailById = new Map(details.map((d) => [d.id, d]));

    const upsertedNames: string[] = [];
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

      const result = await upsertArtistFromSpotify(admin, detail, apply);
      if (result === 'dry' || result === 'inserted' || result === 'updated') {
        if (!artistsToUpsertIds.has(detail.id)) {
          artistsToUpsertIds.add(detail.id);
          upsertedNames.push(detail.name);
        }
      }
    }

    if (apply) {
      await admin
        .from('songs')
        .update({
          spotify_artists: track.spotifyArtists ?? track.artists.map((a) => a.name).join(', '),
          spotify_name: track.spotifyName ?? undefined,
        })
        .eq('id', row.song_id);

      clearArtistLookupIndexCache();
      index = await loadArtistLookupIndex(admin);
      const sync = await syncSongCreditsFromSongId(admin, row.song_id, true, index);
      if (sync && sync.creditCount > 0 && sync.unresolved.length === 0) {
        songsFullFix++;
      } else {
        songsPartialRemain++;
      }
    } else {
      const apiNorm = new Set(track.artists.map((a) => normName(a.name)));
      const stillMissing = unresolvedBefore.filter((n) => !apiNorm.has(normName(n)));
      if (stillMissing.length === 0) songsFullFix++;
      else songsPartialRemain++;
    }

    if (samples.length < 8) {
      samples.push({
        song_id: row.song_id,
        display_title: song.display_title,
        spotify_track_id: trackId,
        unresolved_before: unresolvedBefore,
        spotify_api_artists: track.artists.map((a) => a.name),
        would_upsert_artists: upsertedNames,
      });
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    input: inputPath,
    needs_action_rows: needsRows.length,
    processed: targets.length,
    with_spotify_track_id: withTrack.length,
    without_spotify_track_id: noTrack,
    unique_artists_upsert_or_would: artistsToUpsertIds.size,
    songs_fully_fixed: songsFullFix,
    songs_still_partial: songsPartialRemain,
    api_errors: apiErrors,
    samples,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!apply) {
    console.log('\nRun with --apply to write artists + spotify_artists + song_credits.');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
