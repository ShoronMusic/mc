/**
 * 選曲時 DB 登録用のタイトル／アーティスト正規化（Spotify 照合・songs 行と共用）
 */
import { cleanTitle, getArtistDisplayString } from '@/lib/format-song-display';
import { artistNameToMusic8Slug, formatArtistDisplayName } from '@/lib/music8-artist-display';
import { stripLeadingArticleForSort } from '@/lib/admin-library-index';

const LEADING_ARTICLE = /^(the|a|an)\s+(.+)$/i;

export type RegistrationArtistSplit = {
  nameBase: string;
  thePrefix: string | null;
  displayName: string;
  slug: string;
  creditNames: string[];
};

/** YouTube 解決アーティスト → m8 準拠の name_base / the_prefix / slug */
export function splitArtistNameForM8Storage(artistInput: string): RegistrationArtistSplit | null {
  const displayLine = getArtistDisplayString(artistInput.trim());
  if (!displayLine) return null;

  const creditNames = displayLine
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const primary = creditNames[0] ?? displayLine.trim();
  if (!primary) return null;

  const articleMatch = primary.match(LEADING_ARTICLE);
  let thePrefix: string | null = null;
  let nameBase = primary;
  if (articleMatch) {
    thePrefix = articleMatch[1].charAt(0).toUpperCase() + articleMatch[1].slice(1).toLowerCase();
    nameBase = articleMatch[2].trim();
  }
  if (!nameBase) return null;

  const displayName = formatArtistDisplayName(nameBase, thePrefix) || primary;
  const slug = artistNameToMusic8Slug(primary);
  if (!slug) return null;

  return { nameBase, thePrefix, displayName, slug, creditNames };
}

export function normalizeSongTitleForRegistration(songTitle: string): string {
  return cleanTitle(songTitle.trim());
}

export function normalizeArtistAndTitleForRegistration(
  mainArtist: string | null | undefined,
  songTitle: string | null | undefined,
): { displayArtist: string; songTitle: string } | null {
  const artistRaw = (mainArtist ?? '').trim();
  const titleRaw = (songTitle ?? '').trim();
  if (!artistRaw || !titleRaw) return null;
  const split = splitArtistNameForM8Storage(artistRaw);
  if (!split) return null;
  const song = normalizeSongTitleForRegistration(titleRaw);
  if (!song) return null;
  const displayArtist =
    split.creditNames.length > 1 ? split.creditNames.join(', ') : split.displayName;
  return { displayArtist, songTitle: song };
}

/** Spotify／DB 照合用の正規化キー */
export function compactMatchKey(s: string): string {
  return stripLeadingArticleForSort(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
