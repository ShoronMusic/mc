import { artistNamesMatchIgnoringLeadingArticle } from '@/lib/library-search-query';
import { musicLibraryNameMatchesArtistSlug } from '@/lib/music-library-labels';
import type { MusicLibraryListArtist } from '@/lib/music-library-types';

export type MusicLibraryPageArtistRef = {
  slug: string;
  name?: string | null;
};

export function isMusicLibraryPageArtist(
  artist: Pick<MusicLibraryListArtist, 'name' | 'slug'>,
  page: MusicLibraryPageArtistRef | null | undefined,
): boolean {
  if (!page) return false;
  const pageSlug = (page.slug ?? '').trim().toLowerCase();
  const artistSlug = (artist.slug ?? '').trim().toLowerCase();
  if (pageSlug && artistSlug && pageSlug === artistSlug) return true;
  if (pageSlug && musicLibraryNameMatchesArtistSlug(artist.name, pageSlug)) return true;
  if (artistSlug && musicLibraryNameMatchesArtistSlug(page.name ?? '', artistSlug)) return true;
  if (artistNamesMatchIgnoringLeadingArticle(artist.name, page.name ?? '')) return true;
  return false;
}

/** アーティストページでは当該アーティストを除き、サブ（共演）だけ返す。未指定なら全員。 */
export function musicLibraryNowPlayingArtistTabs(
  artists: readonly MusicLibraryListArtist[],
  pageArtist?: MusicLibraryPageArtistRef | null,
): MusicLibraryListArtist[] {
  const seen = new Set<string>();
  const out: MusicLibraryListArtist[] = [];
  for (const artist of artists) {
    const key = (artist.slug || artist.name).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (pageArtist && isMusicLibraryPageArtist(artist, pageArtist)) continue;
    out.push(artist);
  }
  return out;
}
