/**
 * 曲詳細の「アーティスト詳細・編集」用。
 * 表示順の正本は main_artist / spotify_artists の先頭＝メイン、以降＝サブ。
 * songs.artist_id が共演側を指していても、先頭名をメインにする。
 */

import { artistNamesMatchIgnoringLeadingArticle } from '@/lib/library-search-query';
import { extractCreditNamesFromSong } from '@/lib/song-credits-resolve';

export type AdminSongArtistLink = {
  id: string;
  name: string;
  isNewArtist?: boolean;
  spotifyArtistId?: string | null;
  kind?: 'main' | 'credit';
  /** artists 行がまだ無い（詳細は名前で開けるが編集は不可） */
  unresolved?: boolean;
};

export function adminSongArtistNamesMatch(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return false;
  if (x.localeCompare(y, undefined, { sensitivity: 'base' }) === 0) return true;
  return artistNamesMatchIgnoringLeadingArticle(x, y);
}

/** 「The Weeknd, Ariana Grande」のような結合表記を1人のマスタと誤認しない */
export function isCombinedCollabArtistLabel(name: string, parts: string[]): boolean {
  if (parts.length < 2) return false;
  const compact = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const n = compact(name);
  if (!n) return false;
  const comma = compact(parts.join(', '));
  const amp = compact(parts.join(' & '));
  const andJoin = compact(parts.join(' and '));
  return n === comma || n === amp || n === andJoin;
}

export function orderedAdminSongArtistNames(input: {
  spotifyArtists?: string | null;
  mainArtist?: string | null;
  displayTitle?: string | null;
  music8SongData?: Record<string, unknown> | null;
  trackArtistNames?: string[] | null;
}): string[] {
  const extracted = extractCreditNamesFromSong({
    spotify_artists: input.spotifyArtists ?? null,
    main_artist: input.mainArtist ?? null,
    music8_song_data: input.music8SongData ?? null,
    display_title: input.displayTitle ?? null,
    trackArtistNames: input.trackArtistNames ?? null,
  });
  return (extracted?.names ?? []).map((n) => n.trim()).filter(Boolean);
}

function normalizeLink(item: AdminSongArtistLink): AdminSongArtistLink | null {
  const id = item.id.trim();
  const name = item.name.trim();
  if (!name) return null;
  return {
    id,
    name,
    isNewArtist: Boolean(item.isNewArtist),
    spotifyArtistId: (item.spotifyArtistId ?? '').trim() || null,
    kind: item.kind,
    unresolved: Boolean(item.unresolved) || !id,
  };
}

export function mergeAdminSongArtistLinks(opts: {
  primary?: AdminSongArtistLink | null;
  credits?: AdminSongArtistLink[];
  extra?: AdminSongArtistLink[];
  orderedNames?: string[];
}): AdminSongArtistLink[] {
  const pool: AdminSongArtistLink[] = [];
  const seenIds = new Set<string>();

  const pushPool = (raw: AdminSongArtistLink | null | undefined) => {
    const item = raw ? normalizeLink(raw) : null;
    if (!item?.id) return;
    if (seenIds.has(item.id)) return;
    seenIds.add(item.id);
    pool.push(item);
  };

  pushPool(opts.primary ?? null);
  for (const c of opts.credits ?? []) pushPool(c);
  for (const e of opts.extra ?? []) pushPool(e);

  const orderedNames = (opts.orderedNames ?? []).map((n) => n.trim()).filter(Boolean);
  const usedIds = new Set<string>();
  const out: AdminSongArtistLink[] = [];

  const takeFromPool = (name: string): AdminSongArtistLink | undefined =>
    pool.find(
      (p) =>
        !p.unresolved &&
        p.id &&
        !usedIds.has(p.id) &&
        !isCombinedCollabArtistLabel(p.name, orderedNames) &&
        adminSongArtistNamesMatch(p.name, name),
    );

  if (orderedNames.length > 0) {
    orderedNames.forEach((name, i) => {
      const kind: 'main' | 'credit' = i === 0 ? 'main' : 'credit';
      const hit = takeFromPool(name);
      if (hit) {
        usedIds.add(hit.id);
        out.push({ ...hit, kind, unresolved: false });
        return;
      }
      out.push({
        id: '',
        name,
        kind,
        unresolved: true,
        isNewArtist: false,
        spotifyArtistId: null,
      });
    });
    for (const p of pool) {
      if (!p.id || usedIds.has(p.id)) continue;
      if (isCombinedCollabArtistLabel(p.name, orderedNames)) continue;
      out.push({ ...p, kind: 'credit' });
    }
    return out;
  }

  for (const p of pool) {
    if (isCombinedCollabArtistLabel(p.name, orderedNames)) continue;
    const kind: 'main' | 'credit' = out.length === 0 ? 'main' : 'credit';
    out.push({ ...p, kind });
  }
  return out;
}

export function adminSongArtistCreditsMissingLead(
  orderedNames: string[],
  credits: Array<{ artistName: string }>,
): boolean {
  const lead = orderedNames[0]?.trim() ?? '';
  if (!lead) return false;
  return !credits.some((c) => adminSongArtistNamesMatch(c.artistName, lead));
}
