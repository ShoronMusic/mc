/**
 * needs-action JSONL の曲を display_title（等）から Spotify 検索し、
 * spotify_track_id / spotify_artists を更新 → artists 補完 → song_credits 再同期。
 *
 * Usage:
 *   npx tsx scripts/backfill-needs-action-spotify-from-display-title.ts
 *   npx tsx scripts/backfill-needs-action-spotify-from-display-title.ts --apply
 *   npx tsx scripts/backfill-needs-action-spotify-from-display-title.ts --apply --input=tmp/song-credits-needs-action-....jsonl
 *   npx tsx scripts/backfill-needs-action-spotify-from-display-title.ts --apply --only-missing-track-id
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveArtistIdFromIndex } from '@/lib/song-credits-resolve';
import {
  clearArtistLookupIndexCache,
  loadArtistLookupIndex,
  syncSongCreditsFromSongId,
} from '@/lib/song-credits-sync';
import {
  fetchSpotifyArtistsByIds,
  fetchSpotifyTrackByArtistTitle,
  fetchSpotifyTrackByFreeTextQuery,
  fetchSpotifyTrackWithArtistsById,
  getSpotifyAccessToken,
  parseArtistTitleFromDisplayTitle,
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

type NeedsRow = { song_id: string; display_title?: string | null };

type SongRow = {
  display_title: string;
  main_artist: string;
  song_title: string;
  spotify_track_id: string | null;
};

function parseArgs(argv: string[]) {
  let input = '';
  for (const t of argv) {
    if (t.startsWith('--input=')) input = t.slice('--input='.length);
  }
  const limitRaw = argv.find((t) => t.startsWith('--limit='))?.slice('--limit='.length);
  const limit =
    limitRaw != null && limitRaw !== '' ? Math.max(1, Math.min(5000, Number(limitRaw) || 1)) : null;
  return {
    apply: argv.includes('--apply'),
    input,
    limit,
    onlyMissingTrackId: argv.includes('--only-missing-track-id'),
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
  const { data, error } = await admin.from('artists').select('id').eq('spotify_artist_id', spotifyId).limit(1);
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
  if (!apply) return;
  const existing = await findArtistIdBySpotifyId(admin, meta.id);
  if (existing) return;

  const { data: byName } = await admin
    .from('artists')
    .select('id, name')
    .ilike('name', meta.name)
    .limit(5);
  const row = (byName ?? []).find(
    (r) => normName(String((r as { name?: string }).name ?? '')) === normName(meta.name),
  ) as { id?: string } | undefined;
  const nameId = row?.id?.trim();
  if (nameId) {
    const patch: Record<string, unknown> = { spotify_artist_id: meta.id };
    if (meta.images) patch.spotify_artist_images = meta.images;
    if (meta.popularity != null) patch.spotify_artist_popularity = meta.popularity;
    await admin.from('artists').update(patch).eq('id', nameId);
    return;
  }

  const payload: Record<string, unknown> = { name: meta.name, spotify_artist_id: meta.id };
  if (meta.images) payload.spotify_artist_images = meta.images;
  if (meta.popularity != null) payload.spotify_artist_popularity = meta.popularity;
  const { error } = await admin.from('artists').insert(payload);
  if (error?.code !== '23505') {
    if (error) throw error;
  }
}

async function resolveTrackFromSong(
  song: SongRow,
  onlySearch: boolean,
): Promise<{ track: Awaited<ReturnType<typeof fetchSpotifyTrackWithArtistsById>>; via: string }> {
  const existingId = song.spotify_track_id?.trim();
  if (existingId && !onlySearch) {
    const track = await fetchSpotifyTrackWithArtistsById(existingId);
    return { track, via: 'existing_track_id' };
  }

  const parsed = parseArtistTitleFromDisplayTitle(song.display_title);
  if (parsed) {
    const meta = await fetchSpotifyTrackByArtistTitle(parsed.artist, parsed.title);
    if (meta.spotifyTrackId) {
      const track = await fetchSpotifyTrackWithArtistsById(meta.spotifyTrackId);
      return { track, via: 'display_title_parsed' };
    }
  }

  const ma = song.main_artist?.trim();
  const st = song.song_title?.trim();
  if (ma && st) {
    const meta = await fetchSpotifyTrackByArtistTitle(ma, st);
    if (meta.spotifyTrackId) {
      const track = await fetchSpotifyTrackWithArtistsById(meta.spotifyTrackId);
      return { track, via: 'main_artist_song_title' };
    }
  }

  const meta = await fetchSpotifyTrackByFreeTextQuery(song.display_title);
  if (meta.spotifyTrackId) {
    const track = await fetchSpotifyTrackWithArtistsById(meta.spotifyTrackId);
    return { track, via: 'display_title_free_text' };
  }

  return { track: { spotifyTrackId: null, spotifyPopularity: null, spotifyName: null, spotifyArtists: null, spotifyReleaseDate: null, artists: [] }, via: 'no_match' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { apply, input, limit, onlyMissingTrackId, delayMs } = parseArgs(process.argv.slice(2));

  const inputPath = input ? path.resolve(process.cwd(), input) : findLatestNeedsActionJsonl();
  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error('needs-action JSONL not found');
    process.exit(1);
  }

  const needsRows: NeedsRow[] = fs
    .readFileSync(inputPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as NeedsRow);

  let targets = needsRows;
  if (limit !== null) targets = targets.slice(0, limit);

  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient failed');
    process.exit(1);
  }
  if (!(await getSpotifyAccessToken())) {
    console.error('SPOTIFY credentials missing');
    process.exit(1);
  }

  const ids = targets.map((r) => r.song_id);
  const songById = new Map<string, SongRow>();
  for (let i = 0; i < ids.length; i += 80) {
    const slice = ids.slice(i, i + 80);
    const { data, error } = await admin
      .from('songs')
      .select('id, display_title, main_artist, song_title, spotify_track_id')
      .in('id', slice);
    if (error) throw error;
    for (const s of data ?? []) {
      songById.set((s as { id: string }).id, {
        display_title: (s as { display_title?: string }).display_title ?? '',
        main_artist: (s as { main_artist?: string }).main_artist ?? '',
        song_title: (s as { song_title?: string }).song_title ?? '',
        spotify_track_id: (s as { spotify_track_id?: string | null }).spotify_track_id ?? null,
      });
    }
  }

  if (onlyMissingTrackId) {
    targets = targets.filter((r) => !songById.get(r.song_id)?.spotify_track_id?.trim());
  }

  let index = await loadArtistLookupIndex(admin);
  let searched = 0;
  let noMatch = 0;
  let dbUpdated = 0;
  let creditsFixed = 0;
  let creditsPartial = 0;

  for (const row of targets) {
    const song = songById.get(row.song_id);
    if (!song) continue;

    const onlySearch = onlyMissingTrackId || !song.spotify_track_id?.trim();
    const { track, via } = await resolveTrackFromSong(song, onlySearch);
    searched++;

    if (!track.spotifyTrackId || !track.artists.length) {
      noMatch++;
      if (delayMs > 0) await sleep(delayMs);
      continue;
    }

    if (apply) {
      const payload: Record<string, unknown> = {
        spotify_track_id: track.spotifyTrackId,
        spotify_artists: track.spotifyArtists ?? track.artists.map((a) => a.name).join(', '),
      };
      if (track.spotifyName) payload.spotify_name = track.spotifyName;
      if (track.spotifyPopularity != null) payload.spotify_popularity = Math.round(track.spotifyPopularity);
      if (track.spotifyReleaseDate) payload.spotify_release_date = track.spotifyReleaseDate;

      const { error: uErr } = await admin.from('songs').update(payload).eq('id', row.song_id);
      if (uErr) throw uErr;
      dbUpdated++;

      const details = await fetchSpotifyArtistsByIds(track.artists.map((a) => a.id));
      const detailById = new Map(details.map((d) => [d.id, d]));
      for (const ref of track.artists) {
        const detail = detailById.get(ref.id) ?? {
          id: ref.id,
          name: ref.name,
          popularity: null,
          images: null,
        };
        if (!resolveArtistIdFromIndex(index, detail.name, null)) {
          await upsertArtistFromSpotify(admin, detail, true);
        }
      }

      clearArtistLookupIndexCache();
      index = await loadArtistLookupIndex(admin);
      const sync = await syncSongCreditsFromSongId(admin, row.song_id, true, index);
      if (sync && sync.creditCount > 0 && sync.unresolved.length === 0) creditsFixed++;
      else creditsPartial++;
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        input: inputPath,
        targets: targets.length,
        only_missing_track_id: onlyMissingTrackId,
        searched,
        no_match: noMatch,
        db_updated: apply ? dbUpdated : 0,
        credits_fixed: apply ? creditsFixed : 0,
        credits_still_partial: apply ? creditsPartial : 0,
      },
      null,
      2,
    ),
  );
  if (!apply) console.log('\nRun with --apply to update DB.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
