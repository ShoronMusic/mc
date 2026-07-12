/**
 * 邦楽 YouTube タイトル／チャンネル名からアーティスト・曲名を決定的に抜く（Gemini 不使用）。
 */

import { cleanTitle } from '@/lib/format-song-display';
import { textHasJapaneseScript } from '@/lib/comment-pack-jp-economy';
import { stripYoutubeOfficialChannelSuffix } from '@/lib/domestic-jp-artists';

export type JpSlashTitleParse = {
  artist: string;
  song: string;
};

const JP_DASH_SPLIT = /\s*[-\u2013\u2014\u2015\uFF0D]\s*/;

/** 空白区切りの先頭から、日本語トークンが続く間だけ取り出す（後続の英字表記で打ち切り） */
function extractLeadingJapaneseTokens(phrase: string): string {
  const tokens = phrase.trim().split(/\s+/).filter(Boolean);
  const jp: string[] = [];
  for (const tok of tokens) {
    if (JAPANESE_SCRIPT.test(tok)) jp.push(tok);
    else if (jp.length > 0) break;
  }
  return jp.join(' ').trim();
}

const JAPANESE_SCRIPT =
  /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF]/;

/** `-Music Video-` / `【公式】` 等を除去したうえで邦楽向け前処理 */
export function stripJpOfficialVideoDecorations(raw: string): string {
  let t = (raw ?? '').trim();
  if (!t) return '';
  t = t
    .replace(/\s*[-\u2013\u2014\u2015\uFF0D]\s*Music\s+Video\s*[-\u2013\u2014\u2015\uFF0D]?/gi, ' ')
    .replace(/\s*[-\u2013\u2014\u2015\uFF0D]\s*MV\s*[-\u2013\u2014\u2015\uFF0D]?/gi, ' ')
    .replace(/\s*[-\u2013\u2014\u2015\uFF0D]\s*PV\s*[-\u2013\u2014\uFF0D]?/gi, ' ')
    .replace(/\s*【公式】\s*/g, ' ')
    .replace(/\s*\(Official\s+Music\s+Video\)\s*/gi, ' ')
    .replace(/\s*\(Official\s+Video\)\s*/gi, ' ')
    .replace(/\s*\[Official\s+Video\]\s*/gi, ' ')
    // 宇多田ヒカル「曲名」Music Video / 」official visualizer（閉じ鉤直後・スペース無し含む）
    .replace(/\s*Music\s+Video(?:\s+Behind\s+the\s+Scenes?)?/gi, ' ')
    .replace(/\s*official\s+visualizer\b/gi, ' ')
    .replace(/\s*official\s+audio\b/gi, ' ')
    .replace(/\s*lyric\s+video\b/gi, ' ')
    .replace(/\s*リリック\s*ビデオ\b/gi, ' ')
    .replace(/\s*short\s+version\b/gi, ' ')
    .replace(/\s*\(\s*4K(?:\s*UPGRADE)?\s*\)/gi, ' ')
    .replace(/\s*\[\s*4K(?:\s*UPGRADE)?\s*\]/gi, ' ')
    .replace(/\s+MUSIC\s+VIDEO\s*$/i, ' ')
    .replace(/\s+MV\s*$/i, ' ')
    .replace(/\s+PV\s*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleanTitle(t) || t;
}

/** `Mrs. GREEN APPLE -` のように鉤括弧直前の区切りハイフンを落とす */
export function stripTrailingArtistDashSeparator(artist: string): string {
  return artist.replace(/\s*[-\u2013\u2014\u2015\uFF0D]\s*$/u, '').trim();
}

/**
 * レーベル／ディストリビューター系チャンネル（タイトル側のアーティストを優先すべき）
 * 例: UNIVERSAL MUSIC JAPAN, Sony Music, Warner Music Japan
 */
export function isLikelyRecordLabelOrDistributorChannel(channelTitle: string | null | undefined): boolean {
  const raw = (channelTitle ?? '').trim();
  if (!raw) return false;
  const base = stripYoutubeOfficialChannelSuffix(raw) ?? raw;
  const n = base.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!n) return false;
  if (/\b(universal|sony|warner|emi|atlantic|interscope|capitol|columbia|rca|def jam|motown)\b/.test(n) &&
    /\b(music|records?|entertainment|japan|uk|usa)\b/.test(n)) {
    return true;
  }
  if (/^(universal|sony|warner)\s+music(\s+\w+)?$/i.test(n)) return true;
  if (/\b(vevo|topic)\b/i.test(n)) return true;
  return false;
}

/**
 * `米津玄師 - Flamingo / Kenshi Yonezu` / `米津玄師 - TEENAGE RIOT / Kenshi Yonezu`
 * 日本語アーティスト - 曲名 / 英語アーティスト名
 */
export function parseArtistSongFromJpHyphenTitleSlashEnArtist(
  rawTitle: string,
): JpSlashTitleParse | null {
  const t = stripJpOfficialVideoDecorations(rawTitle);
  if (!t) return null;
  const m = t.match(/^(.+?)\s*[-\u2013\u2014\u2015\uFF0D]\s*(.+?)\s*[/／]\s*(.+)$/);
  if (!m) return null;

  const left = m[1]!.trim();
  const middle = m[2]!.trim();
  const right = m[3]!.trim();
  if (!left || !middle || !right) return null;

  const artist = extractLeadingJapaneseTokens(left) || left;
  if (!artist || !JAPANESE_SCRIPT.test(artist)) return null;

  // 右側は英字アーティスト名（日本語を含まない／ほぼラテン）
  const rightIsEnArtist =
    !JAPANESE_SCRIPT.test(right) &&
    /[A-Za-z]/.test(right) &&
    right.length >= 2 &&
    right.length <= 80;
  if (!rightIsEnArtist) return null;

  const song = cleanTitle(middle) || middle;
  if (!song || song.length < 1) return null;
  if (/^music\s+video$/i.test(song) || /^official$/i.test(song)) return null;
  // 誤って右側を曲名にしない（スラッシュ分割の取り違え防止）
  if (song.localeCompare(right, undefined, { sensitivity: 'base' }) === 0) return null;

  return { artist, song };
}

/**
 * `アーティスト / 曲名`（全角・半角スラッシュ）を分割。
 * 左に日本語があり、右が空でなければ採用。
 * ただし `日本語名 - 曲名 / English Artist` は別パーサ向けに除外する。
 */
export function parseArtistSongFromJpSlashTitle(rawTitle: string): JpSlashTitleParse | null {
  // ハイフン＋スラッシュ併記はこちらより先に扱う
  if (parseArtistSongFromJpHyphenTitleSlashEnArtist(rawTitle)) return null;

  const t = stripJpOfficialVideoDecorations(rawTitle);
  if (!t) return null;
  const m = t.match(/^(.+?)\s*[/／]\s*(.+)$/);
  if (!m) return null;
  const artist = m[1]!.trim();
  const song = cleanTitle(m[2]!.trim()) || m[2]!.trim();
  if (!artist || !song) return null;
  if (!JAPANESE_SCRIPT.test(artist) && !JAPANESE_SCRIPT.test(song)) return null;
  if (song.length < 1 || artist.length < 1) return null;
  if (/^music\s+video$/i.test(song) || /^official$/i.test(song)) return null;

  // 左に「日本語 - …」があり右がラテンのみ → 英アーティスト併記の取り違え
  if (
    JP_DASH_SPLIT.test(artist) &&
    JAPANESE_SCRIPT.test(artist) &&
    !JAPANESE_SCRIPT.test(song) &&
    /[A-Za-z]/.test(song)
  ) {
    return null;
  }

  return { artist, song };
}

/**
 * `米津玄師 - 烏 Kenshi Yonezu - Karasu` 等、先頭が日本語のハイフン区切り＋日英併記。
 * 曲名は日本語部分のみ（`烏`）。英字の重複表記は捨てる。
 */
export function parseArtistSongFromJpBilingualHyphenTitle(rawTitle: string): JpSlashTitleParse | null {
  const t = stripJpOfficialVideoDecorations(rawTitle);
  if (!t) return null;
  const parts = t.split(JP_DASH_SPLIT).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const artist = extractLeadingJapaneseTokens(parts[0]!) || parts[0]!.trim();
  if (!artist || !JAPANESE_SCRIPT.test(artist)) return null;

  const songSegment = parts[1]!;
  const song = extractLeadingJapaneseTokens(songSegment);
  if (!song || !JAPANESE_SCRIPT.test(song)) return null;
  if (/^music\s+video$/i.test(song) || /^official$/i.test(song)) return null;

  return { artist, song };
}

/**
 * `Mr.Children 「Tomorrow never knows」` / `宇多田ヒカル「Mine or Yours」Music Video`
 * アーティスト名の直後に鉤括弧で曲名。閉じ鉤の後ろの MV 表記は無視する。
 */
export function parseArtistSongFromCornerBracketTitle(rawTitle: string): JpSlashTitleParse | null {
  const t = stripJpOfficialVideoDecorations(rawTitle);
  if (!t) return null;
  const m = t.match(/^(.+?)\s*[「『]([^」』]+)[」』]/);
  if (!m) return null;
  const artist = stripTrailingArtistDashSeparator(m[1]!.trim());
  const song = cleanTitle(m[2]!.trim()) || m[2]!.trim();
  if (!artist || !song || artist.length < 2 || song.length < 1) return null;
  if (/^music\s+video$/i.test(song) || /^official$/i.test(song)) return null;
  // アーティスト側に鉤括弧が残っているのは不正
  if (/[「『」』]/.test(artist)) return null;
  return { artist, song };
}

/** チャンネル名から日本語部分とローマ字部分を分離（例: サカナクション sakanaction） */
export function splitJapaneseAndLatinChannelName(channel: string): {
  japanese: string | null;
  latin: string | null;
} {
  const raw = (channel ?? '').trim();
  if (!raw) return { japanese: null, latin: null };

  const parts = raw.split(/\s+/).filter(Boolean);
  const japaneseParts: string[] = [];
  const latinParts: string[] = [];

  for (const p of parts) {
    if (JAPANESE_SCRIPT.test(p)) japaneseParts.push(p);
    else if (/^[A-Za-z0-9][A-Za-z0-9.\-']*$/.test(p)) latinParts.push(p);
  }

  const japanese = japaneseParts.join(' ').trim() || null;
  const latin = latinParts.join(' ').trim() || null;
  return { japanese, latin };
}

/** 邦楽の正規アーティスト表記（日本語優先。タイトル由来があればレーベルchより優先） */
export function canonicalJapaneseArtistFromChannel(
  channelTitle: string | null | undefined,
  slashArtist: string | null | undefined,
): string | null {
  const channelBase =
    stripYoutubeOfficialChannelSuffix(channelTitle ?? '') ?? (channelTitle ?? '').trim();
  const { japanese, latin } = splitJapaneseAndLatinChannelName(channelBase);
  if (japanese) return japanese;

  const slash = stripTrailingArtistDashSeparator((slashArtist ?? '').trim());
  if (slash && JAPANESE_SCRIPT.test(slash)) {
    const slashLatin = splitJapaneseAndLatinChannelName(slash);
    if (slashLatin.japanese) return slashLatin.japanese;
    return slash;
  }

  // タイトルから取れたアーティスト（英字バンド名含む）を優先。
  // 旧実装は ch のラテン名を先に返していたため、UNIVERSAL MUSIC JAPAN 等が
  // Mrs. GREEN APPLE を上書きしていた。
  if (slash) return slash;

  if (latin) return latin;
  return channelBase || null;
}

/** ローマ字 slug 照合用（チャンネル英字表記） */
export function latinArtistSlugHintFromChannel(channelTitle: string | null | undefined): string | null {
  const { latin } = splitJapaneseAndLatinChannelName(channelTitle ?? '');
  return latin ? latin.toLowerCase() : null;
}

export type JpYoutubeTitleFallbackInput = {
  rawTitle: string;
  channelTitle?: string | null;
  channelAuthor?: string | null;
  resolvedArtist?: string | null;
  resolvedSong?: string | null;
};

export type JpYoutubeTitleFallbackResult = {
  mainArtist: string;
  songTitle: string;
  displayTitle: string;
  artistDisplay: string;
  source:
    | 'jp_hyphen_slash_en'
    | 'jp_slash'
    | 'jp_bilingual_hyphen'
    | 'jp_corner_bracket'
    | 'channel_and_title'
    | 'resolved';
};

/**
 * MusicBrainz 未ヒット時の YouTube フォールバック（邦楽）。
 */
export function resolveDomesticArtistSongFromYoutube(
  input: JpYoutubeTitleFallbackInput,
): JpYoutubeTitleFallbackResult | null {
  const channel = (input.channelTitle ?? input.channelAuthor ?? '').trim();

  const hyphenSlash = parseArtistSongFromJpHyphenTitleSlashEnArtist(input.rawTitle);
  if (hyphenSlash) {
    const canonicalArtist =
      canonicalJapaneseArtistFromChannel(channel, hyphenSlash.artist) ?? hyphenSlash.artist.trim();
    const songTitle = hyphenSlash.song.trim();
    if (!canonicalArtist || !songTitle) return null;
    const displayTitle = `${canonicalArtist} - ${songTitle}`;
    return {
      mainArtist: canonicalArtist,
      songTitle,
      displayTitle,
      artistDisplay: canonicalArtist,
      source: 'jp_hyphen_slash_en',
    };
  }

  const slash = parseArtistSongFromJpSlashTitle(input.rawTitle);

  if (slash) {
    const canonicalArtist =
      canonicalJapaneseArtistFromChannel(channel, slash.artist) ?? slash.artist.trim();
    const songTitle = slash.song.trim();
    if (!canonicalArtist || !songTitle) return null;
    const displayTitle = `${canonicalArtist} - ${songTitle}`;
    return {
      mainArtist: canonicalArtist,
      songTitle,
      displayTitle,
      artistDisplay: canonicalArtist,
      source: 'jp_slash',
    };
  }

  const bilingual = parseArtistSongFromJpBilingualHyphenTitle(input.rawTitle);
  if (bilingual) {
    const canonicalArtist =
      canonicalJapaneseArtistFromChannel(channel, bilingual.artist) ?? bilingual.artist.trim();
    const songTitle = bilingual.song.trim();
    if (!canonicalArtist || !songTitle) return null;
    const displayTitle = `${canonicalArtist} - ${songTitle}`;
    return {
      mainArtist: canonicalArtist,
      songTitle,
      displayTitle,
      artistDisplay: canonicalArtist,
      source: 'jp_bilingual_hyphen',
    };
  }

  const corner = parseArtistSongFromCornerBracketTitle(input.rawTitle);
  if (corner) {
    const canonicalArtist =
      canonicalJapaneseArtistFromChannel(channel, corner.artist) ?? corner.artist.trim();
    const songTitle = corner.song.trim();
    if (!canonicalArtist || !songTitle) return null;
    const displayTitle = `${canonicalArtist} - ${songTitle}`;
    return {
      mainArtist: canonicalArtist,
      songTitle,
      displayTitle,
      artistDisplay: canonicalArtist,
      source: 'jp_corner_bracket',
    };
  }

  const resolvedArtist = (input.resolvedArtist ?? '').trim();
  const resolvedSong = (input.resolvedSong ?? '').trim();
  if (resolvedArtist && resolvedSong) {
    const canonicalArtist =
      canonicalJapaneseArtistFromChannel(channel, resolvedArtist) ?? resolvedArtist;
    const displayTitle = `${canonicalArtist} - ${resolvedSong}`;
    return {
      mainArtist: canonicalArtist,
      songTitle: resolvedSong,
      displayTitle,
      artistDisplay: canonicalArtist,
      source: 'resolved',
    };
  }

  const stripped = stripJpOfficialVideoDecorations(input.rawTitle);
  let canonicalArtist = canonicalJapaneseArtistFromChannel(channel, null);
  if (canonicalArtist && isLikelyRecordLabelOrDistributorChannel(channel)) {
    // レーベル ch だけをアーティストにしない（タイトル側にアーティストが無いとき）
    canonicalArtist = null;
  }
  if (canonicalArtist && stripped && textHasJapaneseScript(stripped)) {
    const displayTitle = `${canonicalArtist} - ${stripped}`;
    return {
      mainArtist: canonicalArtist,
      songTitle: stripped,
      displayTitle,
      artistDisplay: canonicalArtist,
      source: 'channel_and_title',
    };
  }

  return null;
}
