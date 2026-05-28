/**
 * Music8 ローカル JSON と Supabase の差分計画（新規 + 既存更新）。
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseArtistsListJson,
  slugFromArtistMasterJsonFileName,
  type Music8ArtistListEntry,
} from '@/lib/music8-artist-import';
import {
  fingerprintMusic8WpSongJson,
  readStoredSongImportFingerprint,
} from '@/lib/music8-sync-fingerprint';

const PAGE = 1000;

export type Music8SyncDiffOptions = {
  songsDir: string;
  artistsDir: string;
  /** この時刻以降に更新されたファイルだけ「変更候補」にする（省略時は全件ハッシュ比較） */
  sinceMs?: number;
  /** true なら mtime が since より古くても DB フィンガープリント不一致なら stale */
  alwaysCheckFingerprint?: boolean;
  artistsListPath?: string | null;
};

export type SongDbRow = {
  key: string;
  updatedAtMs: number | null;
  storedFingerprint: string | null;
};

export type ArtistDbRow = {
  slug: string;
  music8SyncedAtMs: number | null;
};

export type Music8SyncDiffResult = {
  newSongKeys: string[];
  staleSongKeys: string[];
  newArtistSlugs: string[];
  staleArtistSlugs: string[];
  stats: {
    songFilesOnDisk: number;
    songKeysInDb: number;
    artistFilesOnDisk: number;
    artistSlugsInDb: number;
    songFingerprintReads: number;
    artistFingerprintReads: number;
    sinceMs: number | null;
  };
};

export function songFileKeyFromName(fileName: string): string | null {
  if (!fileName.toLowerCase().endsWith('.json')) return null;
  if (fileName.startsWith('_')) return null;
  const base = fileName.slice(0, -'.json'.length);
  if (!base.trim()) return null;
  return base.trim().toLowerCase();
}

type SongDbSelectRow = {
  music8_artist_slug?: string | null;
  music8_song_slug?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  music8_song_data?: unknown;
};

/** PostgREST 42703 時に列を落として再試行（songs.updated_at は未追加 DB が多い） */
async function fetchSongBatchForSyncDiff(
  admin: SupabaseClient,
  offset: number,
  selectCols: string,
): Promise<{ data: SongDbSelectRow[]; error: { code?: string; message: string } | null }> {
  const { data, error } = await admin
    .from('songs')
    .select(selectCols)
    .order('id', { ascending: true })
    .range(offset, offset + PAGE - 1);
  return {
    data: (data ?? []) as SongDbSelectRow[],
    error: error ? { code: error.code, message: error.message } : null,
  };
}

const SONG_SELECT_CANDIDATES = [
  'music8_artist_slug, music8_song_slug, updated_at, music8_song_data',
  'music8_artist_slug, music8_song_slug, created_at, music8_song_data',
  'music8_artist_slug, music8_song_slug, music8_song_data',
  'music8_artist_slug, music8_song_slug',
] as const;

export async function loadSongDbRows(admin: SupabaseClient): Promise<Map<string, SongDbRow>> {
  const map = new Map<string, SongDbRow>();
  let selectCols: (typeof SONG_SELECT_CANDIDATES)[number] | null = null;
  let useCreatedAtAsUpdated = false;
  let hasMusic8SongData = true;

  for (const candidate of SONG_SELECT_CANDIDATES) {
    const probe = await fetchSongBatchForSyncDiff(admin, 0, candidate);
    if (!probe.error) {
      selectCols = candidate;
      useCreatedAtAsUpdated = candidate.includes('created_at') && !candidate.includes('updated_at');
      hasMusic8SongData = candidate.includes('music8_song_data');
      break;
    }
    if (probe.error.code !== '42703') {
      throw new Error(probe.error.message);
    }
  }

  if (!selectCols) {
    throw new Error(
      'songs に music8_artist_slug / music8_song_slug 列がありません。' +
        'docs/supabase-songs-and-performances-tables.md の「既存 DB への列追加」を SQL Editor で実行してください。',
    );
  }

  for (let offset = 0; ; offset += PAGE) {
    const { data: batch, error } = await fetchSongBatchForSyncDiff(admin, offset, selectCols);
    if (error) {
      if (error.code === '42703') {
        throw new Error(
          `songs の列構成が途中で変わった可能性があります（select: ${selectCols}）。${error.message}`,
        );
      }
      throw new Error(error.message);
    }
    for (const r of batch) {
      const a = (r.music8_artist_slug ?? '').trim().toLowerCase();
      const s = (r.music8_song_slug ?? '').trim().toLowerCase();
      if (!a || !s) continue;
      const key = `${a}_${s}`;
      const tsRaw = useCreatedAtAsUpdated ? r.created_at : r.updated_at;
      const updatedAtMs = tsRaw ? Date.parse(tsRaw) : null;
      map.set(key, {
        key,
        updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : null,
        storedFingerprint: hasMusic8SongData
          ? readStoredSongImportFingerprint(r.music8_song_data)
          : null,
      });
    }
    if (batch.length < PAGE) break;
  }
  return map;
}

export async function loadArtistDbRows(admin: SupabaseClient): Promise<Map<string, ArtistDbRow>> {
  const map = new Map<string, ArtistDbRow>();
  let selectCols = 'music8_artist_slug, music8_synced_at';
  const probe = await admin
    .from('artists')
    .select(selectCols)
    .not('music8_artist_slug', 'is', null)
    .limit(1);
  if (probe.error?.code === '42703') {
    const probe2 = await admin
      .from('artists')
      .select('music8_artist_slug, updated_at')
      .not('music8_artist_slug', 'is', null)
      .limit(1);
    if (probe2.error?.code === '42703') {
      const probe3 = await admin.from('artists').select('music8_artist_slug').not('music8_artist_slug', 'is', null).limit(1);
      if (probe3.error?.code === '42703') {
        throw new Error(
          'artists に music8_artist_slug がありません。docs/supabase-songs-and-performances-tables.md を参照してください。',
        );
      }
      selectCols = 'music8_artist_slug';
    } else if (probe2.error) {
      throw new Error(probe2.error.message);
    } else {
      selectCols = 'music8_artist_slug, updated_at';
    }
  } else if (probe.error) {
    throw new Error(probe.error.message);
  }

  const hasSyncedAt = selectCols.includes('music8_synced_at');
  const useArtistUpdatedAt = !hasSyncedAt && selectCols.includes('updated_at');

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('artists')
      .select(selectCols)
      .not('music8_artist_slug', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      throw new Error(error.message);
    }
    const batch = (data ?? []) as {
      music8_artist_slug?: string | null;
      music8_synced_at?: string | null;
    }[];
    for (const r of batch) {
      const slug = (r.music8_artist_slug ?? '').trim().toLowerCase();
      if (!slug) continue;
      const syncedRaw = hasSyncedAt
        ? (r as { music8_synced_at?: string | null }).music8_synced_at
        : useArtistUpdatedAt
          ? (r as { updated_at?: string | null }).updated_at
          : null;
      const ms = syncedRaw ? Date.parse(syncedRaw) : null;
      map.set(slug, {
        slug,
        music8SyncedAtMs: Number.isFinite(ms) ? ms : null,
      });
    }
    if (batch.length < PAGE) break;
  }
  return map;
}

function listSongFileKeys(songsDir: string): { key: string; filePath: string; mtimeMs: number }[] {
  const abs = path.resolve(songsDir);
  const out: { key: string; filePath: string; mtimeMs: number }[] = [];
  for (const name of fs.readdirSync(abs)) {
    const key = songFileKeyFromName(name);
    if (!key) continue;
    const filePath = path.join(abs, name);
    const st = fs.statSync(filePath);
    if (!st.isFile()) continue;
    out.push({ key, filePath, mtimeMs: st.mtimeMs });
  }
  return out;
}

function listArtistSlugsFromDir(artistsDir: string): { slug: string; filePath: string; mtimeMs: number }[] {
  const abs = path.resolve(artistsDir);
  const out: { slug: string; filePath: string; mtimeMs: number }[] = [];
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    const slug = slugFromArtistMasterJsonFileName(ent.name);
    if (!slug) continue;
    const filePath = path.join(abs, ent.name);
    const st = fs.statSync(filePath);
    out.push({ slug, filePath, mtimeMs: st.mtimeMs });
  }
  return out;
}

function loadArtistsListEntries(listPath: string | null | undefined): Music8ArtistListEntry[] {
  if (!listPath?.trim()) return [];
  const abs = path.resolve(listPath);
  if (!fs.existsSync(abs)) return [];
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8')) as unknown;
  return parseArtistsListJson(raw);
}

function shouldConsiderFileForStale(
  mtimeMs: number,
  sinceMs: number | undefined,
  syncedOrUpdatedMs: number | null,
  alwaysCheckFingerprint: boolean,
): boolean {
  if (alwaysCheckFingerprint) return true;
  if (sinceMs != null && mtimeMs >= sinceMs) return true;
  if (syncedOrUpdatedMs != null && mtimeMs > syncedOrUpdatedMs) return true;
  if (syncedOrUpdatedMs == null) return true;
  return false;
}

export function diffMusic8LibrarySync(
  admin: SupabaseClient,
  opts: Music8SyncDiffOptions,
): Promise<Music8SyncDiffResult> {
  return diffMusic8LibrarySyncAsync(admin, opts);
}

async function diffMusic8LibrarySyncAsync(
  admin: SupabaseClient,
  opts: Music8SyncDiffOptions,
): Promise<Music8SyncDiffResult> {
  const sinceMs = opts.sinceMs;
  const alwaysCheckFingerprint = opts.alwaysCheckFingerprint ?? false;

  const [songDb, artistDb] = await Promise.all([loadSongDbRows(admin), loadArtistDbRows(admin)]);

  const newSongKeys: string[] = [];
  const staleSongKeys: string[] = [];
  let songFingerprintReads = 0;

  for (const { key, filePath, mtimeMs } of listSongFileKeys(opts.songsDir)) {
    const row = songDb.get(key);
    if (!row) {
      newSongKeys.push(key);
      continue;
    }
    const consider =
      shouldConsiderFileForStale(mtimeMs, sinceMs, row.updatedAtMs, alwaysCheckFingerprint) ||
      !row.storedFingerprint;
    if (!consider) continue;

    let diskFp: string | null = null;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
      diskFp = fingerprintMusic8WpSongJson(raw);
      songFingerprintReads += 1;
    } catch {
      staleSongKeys.push(key);
      continue;
    }
    if (!diskFp) {
      staleSongKeys.push(key);
      continue;
    }
    if (!row.storedFingerprint || row.storedFingerprint !== diskFp) {
      staleSongKeys.push(key);
    } else if (sinceMs != null && mtimeMs >= sinceMs) {
      // フィンガープリント未保存の旧行は上で拾う。保存済みで mtime だけ新しい場合はスキップ可
    }
  }

  const listEntries = loadArtistsListEntries(opts.artistsListPath);
  const listSlugs = new Set(listEntries.map((e) => e.slug));

  const newArtistSlugs: string[] = [];
  const staleArtistSlugs: string[] = [];
  let artistFingerprintReads = 0;

  const dirArtists = listArtistSlugsFromDir(opts.artistsDir);

  for (const slug of listSlugs) {
    if (!artistDb.has(slug)) newArtistSlugs.push(slug);
  }

  for (const { slug, filePath, mtimeMs } of dirArtists) {
    if (!artistDb.has(slug)) {
      if (!newArtistSlugs.includes(slug)) newArtistSlugs.push(slug);
      continue;
    }
    const row = artistDb.get(slug)!;
    const consider = shouldConsiderFileForStale(
      mtimeMs,
      sinceMs,
      row.music8SyncedAtMs,
      alwaysCheckFingerprint,
    );
    if (!consider) continue;

    if (row.music8SyncedAtMs == null || mtimeMs > row.music8SyncedAtMs) {
      staleArtistSlugs.push(slug);
      artistFingerprintReads += 1;
    }
  }

  newSongKeys.sort((a, b) => a.localeCompare(b));
  staleSongKeys.sort((a, b) => a.localeCompare(b));
  newArtistSlugs.sort((a, b) => a.localeCompare(b));
  staleArtistSlugs.sort((a, b) => a.localeCompare(b));

  return {
    newSongKeys,
    staleSongKeys,
    newArtistSlugs,
    staleArtistSlugs,
    stats: {
      songFilesOnDisk: listSongFileKeys(opts.songsDir).length,
      songKeysInDb: songDb.size,
      artistFilesOnDisk: dirArtists.length,
      artistSlugsInDb: artistDb.size,
      songFingerprintReads,
      artistFingerprintReads,
      sinceMs: sinceMs ?? null,
    },
  };
}
