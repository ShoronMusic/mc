/**
 * 曲に紐づくアーティスト名の抽出と artists マスタ解決（song_credits 用）。
 */

import { parseCollabArtistNamesFromMainArtist } from '@/lib/library-search-query';
import { parseArtistTitleFromDisplayTitle } from '@/lib/spotify-search-track';

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

  const tokens = s.split(', ').map((t) => t.trim()).filter(Boolean);
  const out: string[] = [];

  const shouldMergePrefixNext = (next: string): boolean =>
    /^(The|A|An|Los|Las|Le|La|Du|De|Van|Von|Mc|DJ|St\.?|Ft\.?)\b/i.test(next);

  for (let i = 0; i < tokens.length; i++) {
    let chunk = tokens[i];
    while (i + 1 < tokens.length) {
      const next = tokens[i + 1];
      // "Earth" + "Wind & Fire" など、バンド名中の & を含む断片を結合
      if (next.includes('&') && !chunk.includes('&')) {
        i++;
        chunk += ', ' + next;
        continue;
      }
      // "Tyler" + "The Creator"（単語1つのあとだけ。Roscoe Dash + DJ Spinz は分離）
      if (shouldMergePrefixNext(next) && !chunk.includes('&') && !chunk.includes(' ')) {
        i++;
        chunk += ', ' + next;
        continue;
      }
      break;
    }
    if (chunk) out.push(chunk);
  }
  return expandCompoundArtistTokens(out);
}

function compactAlpha(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** display_title のアーティスト部とトークン列が同じバンドなら 1 名に寄せる（black country new road 等） */
export function reconcileCreditNamesWithDisplayTitle(
  names: string[],
  displayTitle: string,
): string[] {
  if (names.length < 2) return names;
  const parsed = parseArtistTitleFromDisplayTitle(displayTitle.trim());
  if (!parsed?.artist) return names;
  const titleArtist = parsed.artist.trim();
  if (!titleArtist) return names;

  if (normName(names.join(', ')) === normName(titleArtist)) return names;

  const joinedCompact = compactAlpha(names.join(''));
  const titleCompact = compactAlpha(titleArtist);
  if (joinedCompact === titleCompact) return [titleArtist];

  return names;
}

/** 1 トークンに複数名が入ったものを分割（Tyler, The Creator は維持） */
export function expandCompoundArtistTokens(names: string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    if (!name.includes(', ') || name.includes('&')) {
      out.push(name);
      continue;
    }
    const parts = name.split(', ').map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      out.push(name);
      continue;
    }
    if (parts.length === 2 && /^The\s+/i.test(parts[1]!)) {
      out.push(name);
      continue;
    }
    for (const p of parts) out.push(p);
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
  display_title?: string | null;
  /** GET /v1/tracks/{id} の artists[].name（文字列分解より優先） */
  trackArtistNames?: string[] | null;
  /** 手動指定のクレジット名（最優先） */
  explicitCreditArtists?: string[] | null;
};

/** クレジット名リストとソース（優先: track API → spotify_artists → music8 → main_artist） */
export function extractCreditNamesFromSong(input: SongCreditInput): {
  names: string[];
  source: SongCreditSource;
} | null {
  const explicit = (input.explicitCreditArtists ?? []).map((n) => n.trim()).filter(Boolean);
  if (explicit.length > 0) {
    return { names: explicit, source: 'spotify_artists' };
  }

  const fromTrack = (input.trackArtistNames ?? []).map((n) => n.trim()).filter(Boolean);
  if (fromTrack.length > 0) {
    return { names: fromTrack, source: 'spotify_artists' };
  }

  const fromSpotifyRaw = parseSpotifyArtistsString(input.spotify_artists);
  if (fromSpotifyRaw.length > 0) {
    const names = input.display_title
      ? reconcileCreditNamesWithDisplayTitle(fromSpotifyRaw, input.display_title)
      : fromSpotifyRaw;
    return { names, source: 'spotify_artists' };
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
