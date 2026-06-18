/**
 * Music8 曲 JSON からライブラリ曲詳細用のアーティスト一覧（表示順・役割）を抽出。
 * サイト表示は `acf.spotify_artists`（例: Tiësto, 21 Savage, BIA）に合わせる。
 */

import { parseSpotifyArtistsString } from '@/lib/song-credits-resolve';

export type Music8SongArtistDisplayItem = {
  name: string;
  slug: string | null;
  role: 'main' | 'featured';
};

function asObj(x: unknown): Record<string, unknown> | null {
  if (x != null && typeof x === 'object' && !Array.isArray(x)) return x as Record<string, unknown>;
  return null;
}

function asStr(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

function normName(s: string): string {
  return s.trim().toLowerCase();
}

function dedupeNamesPreserveOrder(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = normName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** 曲 JSON の `artists[]` から slug ↔ name 対応を構築 */
function artistSlugMapsFromWpJson(obj: Record<string, unknown>): {
  slugToName: Map<string, string>;
  nameToSlug: Map<string, string>;
} {
  const slugToName = new Map<string, string>();
  const nameToSlug = new Map<string, string>();
  const raw = obj.artists;
  if (!Array.isArray(raw)) return { slugToName, nameToSlug };
  for (const item of raw) {
    const o = asObj(item);
    if (!o) continue;
    const name = asStr(o.name).trim();
    const slug = asStr(o.slug).trim().toLowerCase();
    if (!name || !slug) continue;
    slugToName.set(slug, name);
    nameToSlug.set(normName(name), slug);
  }
  return { slugToName, nameToSlug };
}

function orderedArtistNamesFromWpJson(obj: Record<string, unknown>): string[] {
  const acf = asObj(obj.acf);
  const custom = asObj(obj.custom_fields);
  const spotifyRaw = asStr(acf?.spotify_artists).trim() || asStr(custom?.spotify_artists).trim();
  if (spotifyRaw) {
    return parseSpotifyArtistsString(spotifyRaw);
  }

  const fromNumbered: string[] = [];
  if (acf) {
    for (let i = 1; i <= 5; i++) {
      const key = `spotify_artists${String(i).padStart(2, '0')}`;
      const n = asStr(acf[key]).trim();
      if (n) fromNumbered.push(n);
    }
  }
  if (fromNumbered.length > 0) return fromNumbered;

  if (Array.isArray(obj.artists)) {
    return obj.artists
      .map((a) => asStr(asObj(a)?.name).trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Music8 WP 曲 JSON から表示用アーティスト（先頭＝メイン、以降＝参加）を返す。
 * `canonicalArtistSlug` はファイル名のメイン slug（例: `tiesto`）。先頭がずれていれば補正する。
 */
export function extractMusic8SongArtistsForDisplay(
  data: unknown,
  canonicalArtistSlug?: string | null,
): Music8SongArtistDisplayItem[] {
  const obj = asObj(data);
  if (!obj) return [];

  const { slugToName, nameToSlug } = artistSlugMapsFromWpJson(obj);
  let names = dedupeNamesPreserveOrder(orderedArtistNamesFromWpJson(obj));

  const canon = (canonicalArtistSlug ?? '').trim().toLowerCase();
  if (canon && slugToName.has(canon)) {
    const canonName = slugToName.get(canon)!;
    names = names.filter((n) => normName(n) !== normName(canonName));
    names.unshift(canonName);
  }
  names = dedupeNamesPreserveOrder(names);

  if (names.length === 0) return [];

  return names.map((name, i) => ({
    name,
    slug: nameToSlug.get(normName(name)) ?? null,
    role: i === 0 ? 'main' : 'featured',
  }));
}

export function formatMusic8SongArtistsLine(
  artists: Music8SongArtistDisplayItem[] | null | undefined,
  fallbackMainArtist?: string | null,
): string {
  if (artists && artists.length > 0) {
    return artists.map((a) => a.name).join(', ');
  }
  const fb = (fallbackMainArtist ?? '').trim();
  return fb || '—';
}
