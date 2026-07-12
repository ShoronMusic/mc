import {
  formatArtistBorn,
  formatArtistDied,
  resolveYoutubeChannelHref,
} from '@/lib/music8-artist-display';

const ORIGIN_COUNTRY_LABELS: Record<string, string> = {
  JPN: '日本',
  USA: 'アメリカ',
  GBR: 'イギリス',
  KOR: '韓国',
  CHN: '中国',
  TWN: '台湾',
  FRA: 'フランス',
  DEU: 'ドイツ',
  CAN: 'カナダ',
  AUS: 'オーストラリア',
};

export type LibraryArtistExternalLinks = {
  youtube: string | null;
  spotify: string | null;
  wikipedia: string | null;
};

export function formatLibraryOriginCountry(code: string | null | undefined): string | null {
  const t = (code ?? '').trim();
  if (!t) return null;
  const upper = t.toUpperCase();
  const label = ORIGIN_COUNTRY_LABELS[upper];
  return label ? `${upper}（${label}）` : t;
}

/** 生年月日から年齢ラベル（例: 34歳 / 享年63歳） */
export function formatLibraryArtistAgeLabel(
  birthDate: string | null | undefined,
  deathDate: string | null | undefined,
): string | null {
  const born = formatArtistBorn(birthDate ?? undefined, deathDate ?? undefined);
  if (!born) return null;
  const ageMatch = born.match(/\((\d+)\)\s*$/);
  if (ageMatch) return `${ageMatch[1]}歳`;
  if ((deathDate ?? '').trim()) {
    const died = formatArtistDied(deathDate ?? undefined, birthDate ?? undefined);
    const diedMatch = died.match(/\((\d+)\)\s*$/);
    if (diedMatch) return `享年${diedMatch[1]}歳`;
  }
  return null;
}

export function buildSpotifyArtistHref(artistId: string | null | undefined): string | null {
  const id = (artistId ?? '').trim();
  return id ? `https://open.spotify.com/artist/${id}` : null;
}

export function buildWikipediaPageHref(page: string | null | undefined): string | null {
  const t = (page ?? '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(t)) {
    return `https://ja.wikipedia.org/wiki/${encodeURIComponent(t)}`;
  }
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(t)}`;
}

export function buildLibraryArtistExternalLinks(input: {
  youtube_channel_url?: string | null;
  youtube_channel_id?: string | null;
  spotify_artist_id?: string | null;
  wikipedia_page?: string | null;
}): LibraryArtistExternalLinks {
  const youtube =
    resolveYoutubeChannelHref(input.youtube_channel_url) ??
    resolveYoutubeChannelHref(input.youtube_channel_id);
  return {
    youtube,
    spotify: buildSpotifyArtistHref(input.spotify_artist_id),
    wikipedia: buildWikipediaPageHref(input.wikipedia_page),
  };
}

export type LibraryArtistDetailTitleLines = {
  /** 例: 米津玄師 （1曲） */
  primary: string;
  /** 例: Kenshi Yonezu / JPN */
  secondary: string | null;
};

export function formatLibraryArtistDetailTitleLines(
  artistName: string,
  originCountry: string | null | undefined,
  songCount: number | null | undefined,
  nameEn?: string | null,
): LibraryArtistDetailTitleLines {
  const name = artistName.trim();
  const origin = (originCountry ?? '').trim().toUpperCase();
  const en = (nameEn ?? '').trim();
  const count = typeof songCount === 'number' && Number.isFinite(songCount) ? songCount : null;
  const countSuffix = count != null ? `（${count}曲）` : '';
  const primary = name ? `${name}${countSuffix ? ` ${countSuffix}` : ''}` : countSuffix;

  const secondaryParts: string[] = [];
  if (en && en.toLowerCase() !== name.toLowerCase()) secondaryParts.push(en);
  if (origin) secondaryParts.push(origin);

  return {
    primary,
    secondary: secondaryParts.length > 0 ? secondaryParts.join(' / ') : null,
  };
}

/** @deprecated 2行表示には formatLibraryArtistDetailTitleLines を使う */
export function formatLibraryArtistDetailTitle(
  artistName: string,
  originCountry: string | null | undefined,
  songCount: number | null | undefined,
  nameEn?: string | null,
): string {
  const lines = formatLibraryArtistDetailTitleLines(artistName, originCountry, songCount, nameEn);
  if (lines.secondary) return `${lines.primary}\n${lines.secondary}`;
  return lines.primary;
}

/** ヨミガナ（年齢）行（例: ヨネヅケンシ（35歳）） */
export function formatLibraryArtistNameJaWithAge(
  nameJa: string | null | undefined,
  ageLabel: string | null | undefined,
): string | null {
  const ja = (nameJa ?? '').trim();
  const age = (ageLabel ?? '').trim();
  if (ja && age) return `${ja}（${age}）`;
  if (ja) return ja;
  return age || null;
}
