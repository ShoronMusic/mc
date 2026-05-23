/**
 * 曲に紐づくアーティスト名の抽出と artists マスタ解決（song_credits 用）。
 */

import { parseCollabArtistNamesFromMainArtist } from '@/lib/library-search-query';

export type SongCreditSource = 'spotify_artists' | 'music8_main_artists' | 'main_artist';

export type ResolvedSongCredit = {
  artistId: string;
  displayOrder: number;
  role: 'main' | 'featured';
  source: SongCreditSource;
  artistName: string;
};

export type ArtistLookupRow = {
  id: string;
  name: string;
  music8_artist_slug: string | null;
};

export type ArtistLookupIndex = {
  byNormName: Map<string, ArtistLookupRow[]>;
  bySlug: Map<string, ArtistLookupRow>;
};

function normName(s: string): string {
  return s.trim().toLowerCase();
}

/** Spotify が `artists[].name` を `, ` で連結した文字列を分解（名前内カンマは結合） */
export function parseSpotifyArtistsString(raw: string | null | undefined): string[] {
  const s = (raw ?? '').trim();
  if (!s) return [];

  const tokens = s.split(', ');
  const out: string[] = [];
  let buf = '';

  const shouldMergeNext = (next: string): boolean =>
    /^(The|A|An|Los|Las|Le|La|Du|De|Van|Von|Mc|DJ|St\.?|Ft\.?)\b/i.test(next.trim());

  for (let i = 0; i < tokens.length; i++) {
    let chunk = tokens[i].trim();
    while (i + 1 < tokens.length && shouldMergeNext(tokens[i + 1])) {
      i++;
      chunk += ', ' + tokens[i].trim();
    }
    if (chunk) out.push(chunk);
  }
  return out;
}

type Music8ArtistHint = { name: string; slug: string | null };

function music8MainArtistsFromSnapshot(
  payload: Record<string, unknown> | null | undefined,
): Music8ArtistHint[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const raw = payload.main_artists;
  if (!Array.isArray(raw)) return [];
  const out: Music8ArtistHint[] = [];
  for (const item of raw) {
    const o = item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
    if (!o) continue;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const slug = typeof o.slug === 'string' ? o.slug.trim().toLowerCase() : null;
    if (name) out.push({ name, slug });
  }
  return out;
}

export function buildArtistLookupIndex(rows: ArtistLookupRow[]): ArtistLookupIndex {
  const byNormName = new Map<string, ArtistLookupRow[]>();
  const bySlug = new Map<string, ArtistLookupRow>();
  for (const row of rows) {
    const k = normName(row.name);
    if (k) {
      const arr = byNormName.get(k) ?? [];
      arr.push(row);
      byNormName.set(k, arr);
    }
    const slug = (row.music8_artist_slug ?? '').trim().toLowerCase();
    if (slug && !bySlug.has(slug)) bySlug.set(slug, row);
  }
  return { byNormName, bySlug };
}

export function resolveArtistIdFromIndex(
  index: ArtistLookupIndex,
  artistName: string,
  music8Hint: Music8ArtistHint | null,
): string | null {
  const slug = (music8Hint?.slug ?? '').trim().toLowerCase();
  if (slug) {
    const hit = index.bySlug.get(slug);
    if (hit) return hit.id;
  }

  const hintName = (music8Hint?.name ?? '').trim();
  if (hintName) {
    const hits = index.byNormName.get(normName(hintName));
    if (hits?.length === 1) return hits[0].id;
    if (hits && hits.length > 1 && slug) {
      const bySlugHit = hits.find((h) => (h.music8_artist_slug ?? '').toLowerCase() === slug);
      if (bySlugHit) return bySlugHit.id;
    }
  }

  const hits = index.byNormName.get(normName(artistName));
  if (!hits?.length) return null;
  if (hits.length === 1) return hits[0].id;
  if (slug) {
    const bySlugHit = hits.find((h) => (h.music8_artist_slug ?? '').toLowerCase() === slug);
    if (bySlugHit) return bySlugHit.id;
  }
  return hits[0].id;
}

export type SongCreditInput = {
  spotify_artists: string | null;
  main_artist: string | null;
  music8_song_data: Record<string, unknown> | null;
};

/** クレジット名リストとソース（優先: spotify_artists → music8 → main_artist） */
export function extractCreditNamesFromSong(input: SongCreditInput): {
  names: string[];
  source: SongCreditSource;
} | null {
  const fromSpotify = parseSpotifyArtistsString(input.spotify_artists);
  if (fromSpotify.length > 0) {
    return { names: fromSpotify, source: 'spotify_artists' };
  }

  const m8 = music8MainArtistsFromSnapshot(input.music8_song_data);
  if (m8.length > 0) {
    return { names: m8.map((a) => a.name), source: 'music8_main_artists' };
  }

  const fromMain = parseCollabArtistNamesFromMainArtist(input.main_artist ?? '');
  if (fromMain.length > 0) {
    return { names: fromMain, source: 'main_artist' };
  }

  return null;
}

export function resolveSongCreditsFromInput(
  input: SongCreditInput,
  index: ArtistLookupIndex,
): { credits: ResolvedSongCredit[]; unresolved: string[]; source: SongCreditSource | null } {
  const extracted = extractCreditNamesFromSong(input);
  if (!extracted) {
    return { credits: [], unresolved: [], source: null };
  }

  const m8 = music8MainArtistsFromSnapshot(input.music8_song_data);
  const credits: ResolvedSongCredit[] = [];
  const unresolved: string[] = [];
  const count = extracted.names.length;

  extracted.names.forEach((name, i) => {
    const hint = m8.find((a) => normName(a.name) === normName(name)) ?? m8[i] ?? null;
    const artistId = resolveArtistIdFromIndex(index, name, hint);
    if (!artistId) {
      unresolved.push(name);
      return;
    }
    const role: 'main' | 'featured' = count <= 2 ? 'main' : i === 0 ? 'main' : 'featured';
    credits.push({
      artistId,
      displayOrder: i,
      role,
      source: extracted.source,
      artistName: name,
    });
  });

  return { credits, unresolved, source: extracted.source };
}
