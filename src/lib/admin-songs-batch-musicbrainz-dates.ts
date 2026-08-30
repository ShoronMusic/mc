/**
 * 曲ダッシュボード — MusicBrainz 原盤公開日の一括補完（空欄のみ）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { simplifySongTitleForMusicBrainzLookup } from '@/lib/admin-song-musicbrainz-lookup';
import { fetchMusicBrainzRecordingMetadata } from '@/lib/musicbrainz-recording-metadata';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MusicBrainzReleaseDateLookup = {
  originalReleaseDate: string | null;
  songTitleJa: string | null;
  lookupSongTitle: string;
  mbArtist: string | null;
  mbSongTitle: string | null;
  recordingScore: number | null;
  genres: string[];
};

export async function lookupMusicBrainzReleaseDate(
  artistName: string,
  songTitle: string,
): Promise<MusicBrainzReleaseDateLookup | null> {
  let usedTitle = songTitle.trim();
  let meta = await fetchMusicBrainzRecordingMetadata(artistName, usedTitle);

  const simplified = simplifySongTitleForMusicBrainzLookup(usedTitle);
  if ((!meta?.originalReleaseDate || !meta?.songTitleJa || meta.genres.length === 0) && simplified) {
    const retry = await fetchMusicBrainzRecordingMetadata(artistName, simplified);
    if (retry) {
      if (!meta) {
        meta = retry;
        usedTitle = simplified;
      } else {
        meta = {
          ...meta,
          originalReleaseDate: meta.originalReleaseDate ?? retry.originalReleaseDate,
          songTitleJa: meta.songTitleJa ?? retry.songTitleJa,
          genres: meta.genres.length > 0 ? meta.genres : retry.genres,
        };
        if (!meta.originalReleaseDate && retry.originalReleaseDate) usedTitle = simplified;
      }
    }
  }

  if (!meta) return null;

  return {
    originalReleaseDate: meta.originalReleaseDate,
    songTitleJa: meta.songTitleJa,
    lookupSongTitle: usedTitle,
    mbArtist: meta.mainArtist,
    mbSongTitle: meta.songTitle,
    recordingScore: meta.recordingScore,
    genres: meta.genres,
  };
}

export type BatchMbDateRowStatus =
  | 'would_update'
  | 'updated'
  | 'skipped_has_date'
  | 'skipped_not_found'
  | 'skipped_no_date'
  | 'skipped_invalid';

export type BatchMbDateRowResult = {
  songId: string;
  mainArtist: string | null;
  songTitle: string | null;
  displayTitle: string | null;
  status: BatchMbDateRowStatus;
  originalReleaseDate: string | null;
  lookupSongTitle: string | null;
  recordingScore: number | null;
};

export type BatchMbDateSummary = {
  requested: number;
  targets: number;
  wouldUpdate: number;
  updated: number;
  skippedHasDate: number;
  skippedNotFound: number;
  skippedNoDate: number;
  skippedInvalid: number;
};

type SongTargetRow = {
  id: string;
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
  original_release_date: string | null;
};

function parseSongIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id !== 'string') continue;
    const t = id.trim();
    if (!t || !UUID_RE.test(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

async function loadSongTargets(admin: SupabaseClient, songIds: string[]): Promise<SongTargetRow[]> {
  const out: SongTargetRow[] = [];
  const chunkSize = 100;
  for (let i = 0; i < songIds.length; i += chunkSize) {
    const chunk = songIds.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from('songs')
      .select('id, main_artist, song_title, display_title, original_release_date')
      .in('id', chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const r = row as SongTargetRow;
      if (r.id) out.push(r);
    }
  }
  return out;
}

export async function dryRunBatchMusicBrainzReleaseDates(
  admin: SupabaseClient,
  songIdsRaw: unknown,
): Promise<{ results: BatchMbDateRowResult[]; summary: BatchMbDateSummary }> {
  const songIds = parseSongIds(songIdsRaw);
  const rows = await loadSongTargets(admin, songIds);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const results: BatchMbDateRowResult[] = [];
  let targets = 0;
  let wouldUpdate = 0;
  let skippedHasDate = 0;
  let skippedNotFound = 0;
  let skippedNoDate = 0;
  let skippedInvalid = 0;

  for (const songId of songIds) {
    const row = byId.get(songId);
    if (!row) {
      skippedInvalid += 1;
      results.push({
        songId,
        mainArtist: null,
        songTitle: null,
        displayTitle: null,
        status: 'skipped_invalid',
        originalReleaseDate: null,
        lookupSongTitle: null,
        recordingScore: null,
      });
      continue;
    }

    if (row.original_release_date?.trim()) {
      skippedHasDate += 1;
      results.push({
        songId: row.id,
        mainArtist: row.main_artist,
        songTitle: row.song_title,
        displayTitle: row.display_title,
        status: 'skipped_has_date',
        originalReleaseDate: row.original_release_date,
        lookupSongTitle: null,
        recordingScore: null,
      });
      continue;
    }

    targets += 1;
    const artist = (row.main_artist ?? '').trim();
    const title = (row.song_title ?? '').trim();
    if (!artist || !title) {
      skippedInvalid += 1;
      results.push({
        songId: row.id,
        mainArtist: row.main_artist,
        songTitle: row.song_title,
        displayTitle: row.display_title,
        status: 'skipped_invalid',
        originalReleaseDate: null,
        lookupSongTitle: null,
        recordingScore: null,
      });
      continue;
    }

    const lookup = await lookupMusicBrainzReleaseDate(artist, title);
    if (!lookup) {
      skippedNotFound += 1;
      results.push({
        songId: row.id,
        mainArtist: row.main_artist,
        songTitle: row.song_title,
        displayTitle: row.display_title,
        status: 'skipped_not_found',
        originalReleaseDate: null,
        lookupSongTitle: null,
        recordingScore: null,
      });
      continue;
    }

    const date = lookup.originalReleaseDate?.trim() ?? '';
    if (!date) {
      skippedNoDate += 1;
      results.push({
        songId: row.id,
        mainArtist: row.main_artist,
        songTitle: row.song_title,
        displayTitle: row.display_title,
        status: 'skipped_no_date',
        originalReleaseDate: null,
        lookupSongTitle: lookup.lookupSongTitle,
        recordingScore: lookup.recordingScore,
      });
      continue;
    }

    wouldUpdate += 1;
    results.push({
      songId: row.id,
      mainArtist: row.main_artist,
      songTitle: row.song_title,
      displayTitle: row.display_title,
      status: 'would_update',
      originalReleaseDate: date,
      lookupSongTitle: lookup.lookupSongTitle,
      recordingScore: lookup.recordingScore,
    });
  }

  return {
    results,
    summary: {
      requested: songIds.length,
      targets,
      wouldUpdate,
      updated: 0,
      skippedHasDate,
      skippedNotFound,
      skippedNoDate,
      skippedInvalid,
    },
  };
}

export async function applyBatchMusicBrainzReleaseDates(
  admin: SupabaseClient,
  updatesRaw: unknown,
): Promise<{ results: BatchMbDateRowResult[]; summary: BatchMbDateSummary }> {
  if (!Array.isArray(updatesRaw)) {
    throw new Error('updates が必要です。');
  }

  const updates: Array<{ songId: string; originalReleaseDate: string }> = [];
  for (const row of updatesRaw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const songId = typeof o.songId === 'string' ? o.songId.trim() : '';
    const originalReleaseDate =
      typeof o.originalReleaseDate === 'string' ? o.originalReleaseDate.trim() : '';
    if (!songId || !UUID_RE.test(songId) || !/^\d{4}-\d{2}-\d{2}$/.test(originalReleaseDate)) continue;
    updates.push({ songId, originalReleaseDate });
  }

  const results: BatchMbDateRowResult[] = [];
  let updated = 0;
  let skippedHasDate = 0;
  let skippedInvalid = 0;

  for (const { songId, originalReleaseDate } of updates) {
    const { data: row, error: selErr } = await admin
      .from('songs')
      .select('id, main_artist, song_title, display_title, original_release_date')
      .eq('id', songId)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!row) {
      skippedInvalid += 1;
      results.push({
        songId,
        mainArtist: null,
        songTitle: null,
        displayTitle: null,
        status: 'skipped_invalid',
        originalReleaseDate: null,
        lookupSongTitle: null,
        recordingScore: null,
      });
      continue;
    }

    const r = row as SongTargetRow;
    if (r.original_release_date?.trim()) {
      skippedHasDate += 1;
      results.push({
        songId: r.id,
        mainArtist: r.main_artist,
        songTitle: r.song_title,
        displayTitle: r.display_title,
        status: 'skipped_has_date',
        originalReleaseDate: r.original_release_date,
        lookupSongTitle: null,
        recordingScore: null,
      });
      continue;
    }

    const { error: updErr } = await admin
      .from('songs')
      .update({ original_release_date: originalReleaseDate })
      .eq('id', songId)
      .is('original_release_date', null);
    if (updErr) throw new Error(updErr.message);

    updated += 1;
    results.push({
      songId: r.id,
      mainArtist: r.main_artist,
      songTitle: r.song_title,
      displayTitle: r.display_title,
      status: 'updated',
      originalReleaseDate,
      lookupSongTitle: null,
      recordingScore: null,
    });
  }

  return {
    results,
    summary: {
      requested: updates.length,
      targets: updates.length,
      wouldUpdate: 0,
      updated,
      skippedHasDate,
      skippedNotFound: 0,
      skippedNoDate: 0,
      skippedInvalid,
    },
  };
}
