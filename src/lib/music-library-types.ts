/**
 * Music Library の表示用型（クライアントでも import 可。DB 非依存）。
 */

export type MusicLibraryVocalLabel = 'F' | 'M';

export type MusicLibraryGenreLink = {
  name: string;
  slug: string;
  href: string;
};

/** Genre BEST 登録。曲一覧のリンク付きラベル用 */
export type MusicLibraryGenreBestLabel = {
  slug: string;
  title: string;
};

/** いま開いている Genre BEST 自身はラベルに出さない */
export function visibleMusicLibraryGenreBestLabels(
  labels: readonly MusicLibraryGenreBestLabel[] | undefined,
  omitSlug?: string | null,
): MusicLibraryGenreBestLabel[] {
  const omit = (omitSlug ?? '').trim();
  return (labels ?? []).filter((lb) => {
    const slug = lb.slug.trim();
    const title = lb.title.trim();
    return Boolean(slug && title && slug !== omit);
  });
}

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
  /** 三点メニュー用。ジャンル別曲一覧へのリンク */
  genreLinks?: MusicLibraryGenreLink[];
  /** 曲に紐づくアーティスト（国籍は人ごと） */
  artists?: MusicLibraryListArtist[];
  /** 曲紹介（`songs.music8_intro`）。無ければ非表示 */
  intro?: string | null;
  /** 週間チャートの順位（1–10）。無ければ非表示 */
  chartPosition?: number | null;
  /** Genre BEST 登録。無ければ非表示 */
  genreBestLabels?: MusicLibraryGenreBestLabel[];
};

export type MusicLibraryArtistProfile = {
  id: string | null;
  name: string;
  slug: string;
  nameJa: string | null;
  nameEn: string | null;
  kind: string | null;
  /** occupations 優先。無ければ kind を表示用に整形 */
  occupation: string | null;
  originCountry: string | null;
  originLabel: string | null;
  activePeriod: string | null;
  membersFallback: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
  profileText: string | null;
  descriptionEn: string | null;
  ageLabel: string | null;
  bornLabel: string | null;
  diedLabel: string | null;
  links: { youtube: string | null; spotify: string | null; wikipedia: string | null };
  memberLinks: { name: string; slug: string | null }[];
  bandLinks: { name: string; slug: string | null }[];
  showMembersLine: boolean;
};

export function emptyMusicLibraryArtistProfile(name: string, slug: string): MusicLibraryArtistProfile {
  return {
    id: null,
    name,
    slug,
    nameJa: null,
    nameEn: null,
    kind: null,
    occupation: null,
    originCountry: null,
    originLabel: null,
    activePeriod: null,
    membersFallback: null,
    imageUrl: null,
    imageCredit: null,
    profileText: null,
    descriptionEn: null,
    ageLabel: null,
    bornLabel: null,
    diedLabel: null,
    links: { youtube: null, spotify: null, wikipedia: null },
    memberLinks: [],
    bandLinks: [],
    showMembersLine: false,
  };
}

export function musicLibraryPlayableTracks(cards: MusicLibrarySongCard[]): MusicLibrarySongCard[] {
  return cards.filter((c) => Boolean((c.videoId ?? '').trim()));
}

export type MusicLibraryChartSlice = {
  key: string;
  label: string;
  count: number;
  percent: number;
  color: string;
  href: string | null;
};

export type MusicLibraryArtistCharts = {
  songCount: number;
  styles: MusicLibraryChartSlice[];
  genres: MusicLibraryChartSlice[];
};

export function emptyMusicLibraryArtistCharts(): MusicLibraryArtistCharts {
  return { songCount: 0, styles: [], genres: [] };
}
