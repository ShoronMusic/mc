/**
 * Music Library の表示用型（クライアントでも import 可。DB 非依存）。
 */

export type MusicLibraryVocalLabel = 'F' | 'M';

export type MusicLibraryListArtist = {
  name: string;
  slug: string | null;
  href: string | null;
  originLabel: string | null;
};

export type MusicLibrarySongCard = {
  id: string;
  songTitle: string;
  artistName: string;
  artistSlug: string | null;
  songSlug: string | null;
  href: string | null;
  artistHref: string | null;
  videoId: string | null;
  spotifyImages: string | null;
  releaseDate: string | null;
  styleSlug?: string | null;
  /** タイトル横。F と M は別ラベル */
  vocalLabels?: MusicLibraryVocalLabel[];
  /** タイトル横の小さめジャンル。例 Pop-punk */
  genreLabel?: string | null;
  /** 曲に紐づくアーティスト（国籍は人ごと） */
  artists?: MusicLibraryListArtist[];
};

export function musicLibraryPlayableTracks(cards: MusicLibrarySongCard[]): MusicLibrarySongCard[] {
  return cards.filter((c) => Boolean((c.videoId ?? '').trim()));
}
