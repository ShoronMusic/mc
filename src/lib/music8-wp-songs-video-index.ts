/**
 * Music8 WP 曲 JSON（`data/songs/{artist}_{slug}.json`）を video_id で引く索引。
 * コラボ曲で musicaichat slug とファイル名 slug がずれるときの原盤日バックフィル用。
 */

import fs from 'node:fs';
import path from 'node:path';

export type Music8WpSongVideoIndexEntry = {
  artistSlug: string;
  songSlug: string;
  basename: string;
};

export type Music8WpSongsVideoIndex = Map<string, Music8WpSongVideoIndexEntry>;

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function asObj(x: unknown): Record<string, unknown> | null {
  if (x != null && typeof x === 'object' && !Array.isArray(x)) return x as Record<string, unknown>;
  return null;
}

function asStr(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

/** `tiesto_both.json` → `{ artistSlug: 'tiesto', songSlug: 'both' }` */
export function parseWpSongJsonBasename(basename: string): { artistSlug: string; songSlug: string } | null {
  const name = path.basename(basename, '.json').trim();
  const idx = name.indexOf('_');
  if (idx <= 0 || idx >= name.length - 1) return null;
  const artistSlug = name.slice(0, idx).trim().toLowerCase();
  const songSlug = name.slice(idx + 1).trim().toLowerCase();
  if (!artistSlug || !songSlug) return null;
  return { artistSlug, songSlug };
}

/** WP 曲 JSON から YouTube video id を抽出（`videoId` / `acf.ytvideoid`） */
export function extractYoutubeVideoIdFromWpSongJson(data: unknown): string | null {
  const obj = asObj(data);
  if (!obj) return null;

  const top = asStr(obj.videoId).trim();
  if (YT_ID_RE.test(top)) return top;

  const acf = asObj(obj.acf);
  const fromAcf = acf ? asStr(acf.ytvideoid).trim() : '';
  if (YT_ID_RE.test(fromAcf)) return fromAcf;

  const custom = asObj(obj.custom_fields);
  const fromCustom = custom ? asStr(custom.ytvideoid).trim() : '';
  if (YT_ID_RE.test(fromCustom)) return fromCustom;

  return null;
}

export function serializeMusic8WpSongsVideoIndex(index: Music8WpSongsVideoIndex): Record<string, Music8WpSongVideoIndexEntry> {
  return Object.fromEntries(index.entries());
}

export function deserializeMusic8WpSongsVideoIndex(
  raw: Record<string, Music8WpSongVideoIndexEntry> | null | undefined,
): Music8WpSongsVideoIndex {
  const out: Music8WpSongsVideoIndex = new Map();
  if (!raw || typeof raw !== 'object') return out;
  for (const [videoId, entry] of Object.entries(raw)) {
    const vid = videoId.trim();
    const artistSlug = (entry?.artistSlug ?? '').trim().toLowerCase();
    const songSlug = (entry?.songSlug ?? '').trim().toLowerCase();
    if (!YT_ID_RE.test(vid) || !artistSlug || !songSlug) continue;
    out.set(vid, {
      artistSlug,
      songSlug,
      basename: entry.basename?.trim() || `${artistSlug}_${songSlug}.json`,
    });
  }
  return out;
}

export function loadMusic8WpSongsVideoIndexFromFile(filePath: string): Music8WpSongsVideoIndex {
  const abs = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(abs, 'utf8')) as Record<string, Music8WpSongVideoIndexEntry>;
  return deserializeMusic8WpSongsVideoIndex(parsed);
}

export function saveMusic8WpSongsVideoIndexToFile(
  filePath: string,
  index: Music8WpSongsVideoIndex,
): void {
  const abs = path.resolve(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(serializeMusic8WpSongsVideoIndex(index), null, 0)}\n`, 'utf8');
}

export type BuildMusic8WpSongsVideoIndexOptions = {
  progressEvery?: number;
  onProgress?: (info: { scanned: number; indexed: number; conflicts: number }) => void;
};

/**
 * ローカル `data/songs/*.json` を走査し video_id → ファイル slug を構築する。
 */
export function buildMusic8WpSongsVideoIndexFromLocalDir(
  songsLocalDir: string,
  options?: BuildMusic8WpSongsVideoIndexOptions,
): Music8WpSongsVideoIndex {
  const base = path.resolve(songsLocalDir);
  const index: Music8WpSongsVideoIndex = new Map();
  const files = fs.readdirSync(base).filter((f) => f.endsWith('.json'));
  const progressEvery = options?.progressEvery ?? 2000;
  let scanned = 0;
  let conflicts = 0;

  for (const file of files) {
    scanned += 1;
    const slugs = parseWpSongJsonBasename(file);
    if (!slugs) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(base, file), 'utf8')) as unknown;
    } catch {
      continue;
    }

    const videoId = extractYoutubeVideoIdFromWpSongJson(parsed);
    if (!videoId) continue;

    const entry: Music8WpSongVideoIndexEntry = {
      artistSlug: slugs.artistSlug,
      songSlug: slugs.songSlug,
      basename: file,
    };
    const prev = index.get(videoId);
    if (prev && (prev.artistSlug !== entry.artistSlug || prev.songSlug !== entry.songSlug)) {
      conflicts += 1;
      continue;
    }
    index.set(videoId, entry);

    if (options?.onProgress && scanned % progressEvery === 0) {
      options.onProgress({ scanned, indexed: index.size, conflicts });
    }
  }

  options?.onProgress?.({ scanned, indexed: index.size, conflicts });
  return index;
}
