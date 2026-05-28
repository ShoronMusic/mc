/**
 * Music8 JSON → mc DB 同期用の安定フィンガープリント。
 * 週次差分で「既存行のメタ変更」を検出するために使う。
 */

import crypto from 'node:crypto';
import {
  buildArtistPatchFromMusic8Json,
  normalizeMusic8ArtistSource,
  type Music8ArtistDbPatch,
} from '@/lib/music8-artist-import';
import { extractMusic8SongFields } from '@/lib/music8-song-fields';

function asObj(x: unknown): Record<string, unknown> | null {
  if (x != null && typeof x === 'object' && !Array.isArray(x)) return x as Record<string, unknown>;
  return null;
}

function asStr(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

/** キー順固定の JSON 文字列（フィンガープリント用） */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}

export function sha256Hex(payload: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function shallowAcfScalars(acf: Record<string, unknown> | null, keys: string[]): Record<string, unknown> {
  if (!acf) return {};
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = acf[k];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = typeof v === 'string' && v.length > 2000 ? `${v.slice(0, 2000)}…` : v;
    }
  }
  return out;
}

/** WP 曲 JSON（`data/songs/{artist}_{song}.json`）から取り込みに効くフィールドだけ */
export function buildMusic8WpSongFingerprintPayload(raw: unknown): Record<string, unknown> | null {
  const obj = asObj(raw);
  if (!obj) return null;
  const ex = extractMusic8SongFields(raw);
  const acf = asObj(obj.acf);
  const artists = Array.isArray(obj.artists) ? obj.artists.slice(0, 8) : [];
  const desc = ex.description.trim();
  return {
    slug: asStr(obj.slug).trim() || null,
    title: asStr(obj.title).trim() || null,
    videoId: asStr(obj.videoId).trim() || null,
    date: asStr(obj.date).trim() || null,
    genres: ex.genres,
    styleIds: ex.styleIds,
    styleNames: ex.styleNames,
    releaseDate: ex.releaseDate,
    primaryArtistNameJa: ex.primaryArtistNameJa,
    vocalLabel: ex.vocalLabel,
    structuredStyleFromFacts: ex.structuredStyleFromFacts,
    description: desc.length > 8000 ? `${desc.slice(0, 8000)}…` : desc,
    acf: shallowAcfScalars(acf, [
      'spotify_track_id',
      'spotify_release_date',
      'spotify_name',
      'spotify_artists',
      'spotify_popularity',
      'spotify_images',
      'spotify_artists01_id',
    ]),
    artists,
  };
}

export function fingerprintMusic8WpSongJson(raw: unknown): string | null {
  const payload = buildMusic8WpSongFingerprintPayload(raw);
  if (!payload) return null;
  return sha256Hex(payload);
}

export function fingerprintFromArtistPatch(patch: Music8ArtistDbPatch): string {
  const copy = { ...patch } as Record<string, unknown>;
  delete copy.music8_synced_at;
  return sha256Hex(copy);
}

export function fingerprintMusic8ArtistJson(raw: unknown): string | null {
  const normalized = normalizeMusic8ArtistSource(raw);
  if (!normalized) return null;
  const patch = buildArtistPatchFromMusic8Json(normalized);
  return fingerprintFromArtistPatch(patch);
}

/** DB の `music8_song_data` に保存したフィンガープリントを読む */
export function readStoredSongImportFingerprint(music8SongData: unknown): string | null {
  const o = asObj(music8SongData);
  if (!o) return null;
  const fp = o.import_fingerprint;
  return typeof fp === 'string' && fp.trim() ? fp.trim() : null;
}
