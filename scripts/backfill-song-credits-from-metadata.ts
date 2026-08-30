/**
 * 全 songs を spotify_artists → music8 main_artists → main_artist の順で song_credits に同期。
 *
 * 事前: docs/supabase-songs-and-performances-tables.md の song_credits SQL を Supabase SQL Editor で実行。
 *
 * Usage:
 *   npx tsx scripts/backfill-song-credits-from-metadata.ts
 *   npx tsx scripts/backfill-song-credits-from-metadata.ts --apply
 *   npx tsx scripts/backfill-song-credits-from-metadata.ts --apply --limit=500 --offset=0
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  clearArtistLookupIndexCache,
  loadArtistLookupIndex,
  planSongCreditDbRows,
  songCreditsTableAvailable,
  type SongCreditDbRow,
} from '@/lib/song-credits-sync';
import { extractCreditNamesFromSong, type SongCreditInput } from '@/lib/song-credits-resolve';
import { fetchSpotifyTrackWithArtistsById } from '@/lib/spotify-search-track';

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
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) args.set(token.slice(2, eq), token.slice(eq + 1));
    else args.set(token.slice(2), '1');
  }
  const limitRaw = args.get('limit');
  const limit =
    limitRaw != null && limitRaw !== ''
      ? Math.max(1, Math.min(5000, Number(limitRaw) || 1))
      : null;
  return {
    apply: argv.includes('--apply'),
    limit,
    offset: Math.max(0, Number(args.get('offset') || '0') || 0),
  };
}

function isRetryableTimeout(error: { code?: string } | null | undefined): boolean {
  return error?.code === '57014' || error?.code === 'PGRST000';
}

async function withTimeoutRetry<T>(
  label: string,
  fn: () => Promise<{ data?: T; error: { code?: string; message?: string } | null }>,
): Promise<T | undefined> {
  const max = 6;
  for (let i = 0; i < max; i++) {
    const { data, error } = await fn();
    if (!error) return data;
    if (!isRetryableTimeout(error)) throw error;
    const wait = 2500 * (i + 1);
    console.error(`${label} timeout (${error.code}), retry in ${wait}ms (${i + 1}/${max})`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error(`${label} failed after ${max} statement-timeout retries`);
}

async function insertCreditRowsBatched(
  admin: ReturnType<typeof createAdminClient>,
  rows: SongCreditDbRow[],
): Promise<void> {
  if (!admin || rows.length === 0) return;
  const INS = 200;
  for (let i = 0; i < rows.length; i += INS) {
    const slice = rows.slice(i, i + INS);
    await withTimeoutRetry(`insert credits ${i}-${i + slice.length}`, async () => {
      const { error } = await admin.from('song_credits').insert(slice);
      return { error };
    });
  }
}

async function updatePrimaryArtistIds(
  admin: ReturnType<typeof createAdminClient>,
  links: { songId: string; artistId: string }[],
): Promise<void> {
  if (!admin) return;
  const CONC = 20;
  for (let i = 0; i < links.length; i += CONC) {
    const slice = links.slice(i, i + CONC);
    await Promise.all(
      slice.map(({ songId, artistId }) =>
        withTimeoutRetry(`update artist_id ${songId}`, async () => {
          const { error } = await admin.from('songs').update({ artist_id: artistId }).eq('id', songId);
          return { error };
        }),
      ),
    );
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { apply, limit, offset } = parseArgs(process.argv.slice(2));
  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient failed');
    process.exit(1);
  }

  if (!(await songCreditsTableAvailable(admin))) {
    console.error(
      'song_credits テーブルがありません。先に docs/supabase-songs-and-performances-tables.md の「曲クレジット」SQL を実行してください。',
    );
    process.exit(1);
  }

  clearArtistLookupIndexCache();
  const index = await loadArtistLookupIndex(admin);
  console.log('artist index loaded');

  const PAGE = 50;
  let scanOffset = offset;
  let processed = 0;
  let withCredits = 0;
  let partialUnresolved = 0;
  let noNames = 0;
  let allUnresolved = 0;
  let creditRowsInserted = 0;
  let skippedJapanese = 0;
  let spotifyLookups = 0;
  const failures: Record<string, unknown>[] = [];

  for (;;) {
    if (limit !== null && processed >= limit) break;

    const rangeEnd =
      limit !== null ? Math.min(scanOffset + PAGE - 1, offset + limit - 1) : scanOffset + PAGE - 1;
    const batch = await withTimeoutRetry(
      `select songs ${scanOffset}-${rangeEnd}`,
      async () =>
        await admin
          .from('songs')
          .select(
            'id, display_title, spotify_artists, main_artist, music8_song_data, spotify_track_id',
          )
          .order('id')
          .range(scanOffset, rangeEnd),
    );
    if (!batch?.length) break;

    const chunkCreditRows: SongCreditDbRow[] = [];
    const chunkSongIds: string[] = [];
    const primaryLinks: { songId: string; artistId: string }[] = [];

    for (const row of batch) {
      if (limit !== null && processed >= limit) break;
      processed++;

      const songId = (row as { id: string }).id;
      const input: SongCreditInput = {
        spotify_artists: (row as { spotify_artists?: string | null }).spotify_artists ?? null,
        main_artist: (row as { main_artist?: string | null }).main_artist ?? null,
        music8_song_data:
          (row as { music8_song_data?: Record<string, unknown> | null }).music8_song_data ?? null,
        display_title: (row as { display_title?: string | null }).display_title ?? null,
      };

      let planned = planSongCreditDbRows(songId, input, index);
      if (planned.skippedJapanese) {
        skippedJapanese += 1;
        continue;
      }

      const trackId = (row as { spotify_track_id?: string | null }).spotify_track_id?.trim() ?? '';
      if ((planned.unresolved.length > 0 || planned.creditCount === 0) && trackId) {
        const track = await fetchSpotifyTrackWithArtistsById(trackId);
        spotifyLookups += 1;
        if (track.artists.length > 0) {
          input.trackArtistNames = track.artists.map((a) => a.name);
          planned = planSongCreditDbRows(songId, input, index);
          if (planned.skippedJapanese) {
            skippedJapanese += 1;
            continue;
          }
        }
      }

      if (planned.creditCount > 0) {
        withCredits++;
        if (planned.unresolved.length > 0) partialUnresolved++;
        chunkCreditRows.push(...planned.rows);
        chunkSongIds.push(songId);
        if (planned.primaryArtistId) {
          primaryLinks.push({ songId, artistId: planned.primaryArtistId });
        }
      } else if (planned.unresolved.length > 0) {
        allUnresolved++;
        const extracted = extractCreditNamesFromSong(input);
        failures.push({
          song_id: songId,
          display_title: (row as { display_title?: string | null }).display_title ?? null,
          source: planned.source,
          unresolved: planned.unresolved,
          credit_names: extracted?.names,
        });
      } else {
        noNames++;
        failures.push({
          song_id: songId,
          display_title: (row as { display_title?: string | null }).display_title ?? null,
          source: null,
          unresolved: [],
          spotify_artists: input.spotify_artists,
          main_artist: input.main_artist,
        });
      }
    }

    if (apply && chunkSongIds.length > 0) {
      const DEL = 10;
      for (let d = 0; d < chunkSongIds.length; d += DEL) {
        const ids = chunkSongIds.slice(d, d + DEL);
        await withTimeoutRetry(`delete credits ${ids.length} songs`, async () => {
          const { error } = await admin.from('song_credits').delete().in('song_id', ids);
          return { error };
        });
      }
      await insertCreditRowsBatched(admin, chunkCreditRows);
      creditRowsInserted += chunkCreditRows.length;
      await updatePrimaryArtistIds(admin, primaryLinks);
    }

    console.log(`chunk done: processed=${processed} credits_rows=${chunkCreditRows.length}`);

    scanOffset += batch.length;
    if (batch.length < PAGE) break;
    if (limit !== null && processed >= limit) break;
  }

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    offset,
    limit: limit ?? 'all',
    processed,
    songs_with_at_least_one_credit: withCredits,
    credit_rows_inserted: apply ? creditRowsInserted : 0,
    partial_unresolved: partialUnresolved,
    no_credit_names: noNames,
    all_names_unresolved: allUnresolved,
    skipped_japanese: skippedJapanese,
    spotify_lookups: spotifyLookups,
    failures_logged: failures.length,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
    const outDir = path.resolve(process.cwd(), 'tmp');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(outDir, `song-credits-backfill-failures-${stamp}.jsonl`);
    const lines = failures.map((f) => JSON.stringify(f)).join('\n') + '\n';
    fs.writeFileSync(outPath, lines, 'utf8');
    console.log(`failures written: ${outPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
