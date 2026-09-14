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
  /** 9スタイル表示名。例 Electronica */
  styleLabel?: string | null;
  /** タイトル横。F と M は別ラベル */
  vocalLabels?: MusicLibraryVocalLabel[];
  /** タイトル横の小さめジャンル。例 Pop-punk */
  genreLabel?: string | null;
  /** 曲に紐づくアーティスト（国籍は人ごと） */
  artists?: MusicLibraryListArtist[];
  /** 曲紹介（`songs.music8_intro`）。無ければ非表示 */
  intro?: string | null;
};

export type MusicLibraryArtistProfile = {
  id: string | null;
  name: string;
  slug: string;
  nameJa: string | null;
  kind: string | null;
  originCountry: string | null;
  originLabel: string | null;
  activePeriod: string | null;
  membersFallback: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
  profileText: string | null;
  ageLabel: string | null;
  links: { youtube: string | null; spotify: string | null; wikipedia: string | null };
  memberLinks: { name: string; slug: string | null }[];
  bandLinks: { name: string; slug: string | null }[];
  showMembersLine: boolean;
};

export function musicLibraryPlayableTracks(cards: MusicLibrarySongCard[]): MusicLibrarySongCard[] {
  return cards.filter((c) => Boolean((c.videoId ?? '').trim()));
}
