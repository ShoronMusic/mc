/**
 * マイリスト編集時のアーティスト／曲名の初期提案。
 * ref/YTtoWP-YouTube動画をWP新規投稿で開く.js の区切り・タイトル清掃を簡略移植。
 * YouTube の「チャンネル名 + 動画タイトル（アーティスト - 曲名）」想定。
 * 複数アーティストは「A, B, C - 曲名」のようにカンマ+空白区切り（曲名内のハイフンは最初の「 - 」のみで分割）。
 */

import { cleanAuthor, getArtistDisplayString, getMainArtist } from '@/lib/format-song-display';

/** 「左（アーティスト側）|右（曲名側）」の最初の境界（曲名内の Non-Film 等は分割しない） */
const FIRST_SPACED_DASH = /\s+[-\u2013\u2014\u2015]\s+/;
/** スペース無しの「TheProdigy-Breathe」型も救う（oEmbed が詰めたタイトルで mylist_oembed がチャンネル丸かぶりするのを防ぐ） */
const FIRST_DASH_LOOSE = /\s*[-\u2013\u2014\u2015\u2011]\s*/;

/**
 * 曲名側から括弧・公式表記などを除去（ref の titlePart 処理のサブセット）
 */
export function cleanMyListSongTitle(raw: string): string {
  let t = raw.trim();
  if (!t) return t;
  t = t.replace(/^'\s*(.*?)\s*'$/, '$1');
  t = t.replace(/\s*\|\s*[^|]+$/, '');
  t = t.replace(/["]/g, '');
  t = t.replace(
    /(Official\s*Music\s*Video|Official\s*Video|OFFICIAL\s*MUSIC\s*VIDEO|Official\s*Audio|Official\s*Visualizer|Official\s*Lyric\s*Video)/gi,
    '',
  );
  t = t.replace(/\s*\([^)]*Official[^)]*\)/gi, '');
  t = t.replace(/\s*-\s*Official[^-]*$/gi, '');
  t = t.replace(/\s*-\s*$/, '');
  const unnecessary = [
    'Visualizer',
    'Lyric Video',
    'Music Video',
    '\\| Vevo',
    '\\| .*',
    '\\[Official Music Video\\]',
    '\\[Official Lyric Video\\]',
    '\\[Official Video\\]',
  ];
  for (const text of unnecessary) {
    t = t.replace(new RegExp(text, 'gi'), '');
  }
  // "Song // Official ... // Label Records" のような後段ラベルを除去
  t = t.replace(/\s*\/\/\s*(official|music video|official music video|official video|video|audio|lyric|lyrics)[^/]*$/gi, ' ');
  t = t.replace(/\s*\/\/\s*[^/]*\b(records?|recordings?|music|entertainment|official)\b[^/]*$/gi, ' ');
  // 末尾のレーベル/チャンネル名が残る場合を除去（例: "... AFM Records"）
  t = t.replace(/\s*[-|/\\:;,.]*\s*[A-Za-z0-9 '&.\-]{2,80}\b(records?|recordings?|music|entertainment)\b\s*$/gi, ' ');
  t = t.replace(/\s*([\(\[\{])([^)\]\}]*)([\)\]\}])\s*/g, (full, _open: string, inner: string) => {
    const body = String(inner ?? '').trim();
    if (!body) return ' ';
    // 曲名本体の括弧は残し、動画ラベル系だけ除去する。
    if (
      /\b(official|music video|video|audio|visualizer|lyric|lyrics|hd|4k|8k|uhd|remaster(?:ed)?|live|tv size|short ver(?:sion)?|non[-\s]?film|version)\b/i.test(
        body,
      )
    ) {
      return ' ';
    }
    if (/^(?:19|20)\d{2}$/.test(body)) return ' ';
    return full;
  });
  // クリーニング後に残る空の "//" を整理
  t = t.replace(/\s*\/\/\s*\/\/\s*/g, ' ').replace(/\s*\/\/\s*$/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * oEmbed の author_name 相当が YouTube チャンネルっぽいか（公式アーティスト名ではなさそう）
 */
export function isLikelyYoutubeChannelUploader(name: string): boolean {
  const s = name.trim();
  if (!s) return false;
  if (/vevo$/i.test(s)) return true;
  if (/topic$/i.test(s)) return true;
  if (/official$/i.test(s)) return true;
  // records? だけだと「Recordings」（XL Recordings 等）にマッチしない（record の直後が単語境界にならない）
  if (/\b(recordings?|records?|music|channel|media|tv|noise|videos?)\b/i.test(s)) return true;
  if (!/\s/.test(s) && /^[A-Z0-9][A-Z0-9 _.-]{2,24}$/.test(s) && /[A-Z]/.test(s)) return true;
  if (!/\s/.test(s) && s.length >= 6 && /[a-z][A-Z]/.test(s)) return true;
  return false;
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function looksLikeArtistNameInParen(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 80) return false;
  if (/\b(official|video|audio|lyric|lyrics|hd|4k|8k|uhd|remaster(?:ed)?|live)\b/i.test(t)) return false;
  // 「Swordfish Mix」「Club Remix」等は曲のバージョン名で、括弧内アーティスト誤認しやすい
  if (parenLooksLikeMixOrVersionLabel(t)) return false;
  // TS target 差で \p{L} がビルドエラーになる環境があるため、Unicodeプロパティ正規表現は使わない。
  // ASCII 英字が1文字以上あり、許容記号のみで構成される場合を artist 候補とみなす。
  if (!/[A-Za-z]/.test(t)) return false;
  if (!/^[A-Za-z0-9 '&.,!+\-/]+$/.test(t)) return false;
  return true;
}

/** 括弧内がミックス／エディット等の楽曲バージョン表記っぽいとき true（アーティスト名にしない） */
function parenLooksLikeMixOrVersionLabel(inner: string): boolean {
  const x = inner.trim();
  if (!x) return false;
  return /\b(mix|remix|re-?mix|megamix|dub|edit|version|vip|instrumental|acoustic|karaoke|radio|extended|short\s+ver|full\s+ver)\b/i.test(
    x,
  );
}

/**
 * タイトルが "Song Title (Artist Name)" 型なら、括弧内をアーティスト候補として返す。
 * 公式ラベル "(Official Video)" などは除外。
 */
function splitSongTitleWithTrailingArtistParen(
  title: string,
): { artist: string; song: string } | null {
  const t = title.trim();
  const m = t.match(/^(.*)\(([^()]{2,100})\)\s*$/);
  if (!m) return null;
  const songRaw = (m[1] ?? '').trim();
  const artistRaw = (m[2] ?? '').trim();
  if (!songRaw || !artistRaw) return null;
  if (!looksLikeArtistNameInParen(artistRaw)) return null;
  const song = cleanMyListSongTitle(songRaw);
  if (!song) return null;
  return { artist: artistRaw, song };
}

/**
 * 「BTS (방탄소년단) 'MIC Drop …' Official MV」型（HYBE 公式でハイフン無し）。
 * シングルクォートで曲名を囲む K-POP / 公式表記向け。
 */
function splitArtistQuotedSongFromYoutubeTitle(title: string): { artist: string; song: string } | null {
  let raw = title.trim();
  if (!raw) return null;
  raw = raw.replace(/[\u2018\u2019\u201b\u2032]/g, "'");
  const m = raw.match(/^(.+?)\s+'([^']{2,240})'\s*(.*)$/);
  if (!m) return null;
  const artistRaw = (m[1] ?? '').trim();
  const quotedSong = (m[2] ?? '').trim();
  const tail = (m[3] ?? '').trim();
  if (!artistRaw || !quotedSong) return null;
  if (artistRaw.length < 2) return null;
  const combinedForClean = tail ? `${quotedSong} ${tail}`.trim() : quotedSong;
  const songOut = cleanMyListSongTitle(combinedForClean);
  if (!songOut) return null;
  return { artist: normalizeSpaces(artistRaw), song: songOut };
}

/**
 * 「Bryan Adams, Rod Stewart, Sting」→ 配列（カンマ+空白区切り。アーティスト名にカンマが入る場合は要手直し）
 */
export function parseCommaSeparatedArtists(blob: string): string[] {
  const t = normalizeSpaces(blob);
  if (!t) return [];
  return t
    .split(/,\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * タイトル文字列を「最初のスペース付きダッシュ」だけで二分割
 */
export function splitTitleAtFirstSpacedDash(title: string): { left: string; right: string } | null {
  const t = title.trim();
  const m = t.match(FIRST_SPACED_DASH);
  if (!m || m.index === undefined) return null;
  const left = t.slice(0, m.index).trim();
  const right = t.slice(m.index + m[0].length).trim();
  if (!left || !right) return null;
  return { left, right };
}

/**
 * 最初のハイフン／ダッシュで二分割（前後スペース任意）。1文字だけの片側は誤爆しやすいので弾く。
 */
export function splitTitleAtFirstDashLoose(title: string): { left: string; right: string } | null {
  const t = title.trim();
  const m = t.match(FIRST_DASH_LOOSE);
  if (!m || m.index === undefined) return null;
  const left = t.slice(0, m.index).trim();
  const right = t.slice(m.index + m[0].length).trim();
  if (left.length < 2 || right.length < 2) return null;
  return { left, right };
}

/** 「Artist | Song」形式（パイプの前後に空白あり） */
export function splitTitleAtFirstPipe(title: string): { left: string; right: string } | null {
  const t = title.trim();
  const idx = t.indexOf(' | ');
  if (idx <= 0) return null;
  const left = t.slice(0, idx).trim();
  const right = t.slice(idx + 3).trim();
  if (left.length < 2 || right.length < 2) return null;
  return { left, right };
}

/** 左片に [Official Music Video] 等（曲名側の付帯）が含まれる */
function titleSegmentHasOfficialMediaBracket(segment: string): boolean {
  return /\[[^\]]*\b(?:official|music\s+video|lyric|lyrics|video|audio|visualizer|hd|4k)\b[^\]]*\]/i.test(
    segment.trim(),
  );
}

/** 右片が「A X B」「A & B」等の共演アーティスト列っぽい */
function segmentLooksLikeArtistCollaborationBlob(segment: string): boolean {
  const s = segment.trim();
  return /\s+[x×]\s+/.test(s) || /\s+&\s+/.test(s) || /\s+\band\s+/i.test(s);
}

/** oEmbed 作者名が右片の先頭アーティストと一致（Linkin Park vs Linkin Park X Steve Aoki） */
function channelNameAlignsWithArtistSegment(author: string, artistSegment: string): boolean {
  const ac = cleanAuthor(author).toLowerCase().replace(/\s+/g, ' ').trim();
  const rs = artistSegment.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!ac || !rs) return false;
  if (!rs.startsWith(ac)) return false;
  if (rs.length === ac.length) return true;
  const rest = rs.slice(ac.length).trim();
  if (!rest.length) return true;
  return /^(?:[x×&,]|\band\b)/i.test(rest);
}

/**
 * 「曲名 [Official …] - Linkin Park X Steve Aoki」のように曲が先・共演が後のとき、
 * 先頭「 - 」だけでは左＝アーティストと誤るため入れ替える。
 */
function shouldSwapMylistHyphenOrderForSongFirst(
  leftSeg: string,
  rightSeg: string,
  author: string,
): boolean {
  if (!titleSegmentHasOfficialMediaBracket(leftSeg)) return false;
  if (segmentLooksLikeArtistCollaborationBlob(rightSeg)) return true;
  return channelNameAlignsWithArtistSegment(author, rightSeg);
}

export type MyListArtistTitleSuggestion = {
  /** 1 人目がメイン。DB の artist は `, ` 結合で保存 */
  artists: string[];
  title: string;
};

/**
 * DB の artist / title から、編集フォーム用の提案を返す。
 */
export function suggestMyListArtistTitleFromYoutubeStyle(
  storedArtist: string | null | undefined,
  storedTitle: string | null | undefined,
): MyListArtistTitleSuggestion {
  const a = normalizeSpaces(storedArtist ?? '');
  const t = (storedTitle ?? '').trim();

  if (!t) {
    const fromStored = parseCommaSeparatedArtists(a);
    return { artists: fromStored.length > 0 ? fromStored : a ? [a] : [''], title: t };
  }

  const splitRaw =
    splitTitleAtFirstSpacedDash(t) ?? splitTitleAtFirstDashLoose(t) ?? splitTitleAtFirstPipe(t);
  if (!splitRaw) {
    const quotedPair = splitArtistQuotedSongFromYoutubeTitle(t);
    if (quotedPair) {
      const fromQuote = parseCommaSeparatedArtists(quotedPair.artist);
      return {
        artists: fromQuote.length > 0 ? fromQuote : [quotedPair.artist],
        title: quotedPair.song,
      };
    }
    const trailingParen = splitSongTitleWithTrailingArtistParen(t);
    if (trailingParen) {
      const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
      const uploaderLikely = isLikelyYoutubeChannelUploader(a);
      const differentFromStoredArtist = a ? norm(a) !== norm(trailingParen.artist) : true;
      if (uploaderLikely || differentFromStoredArtist) {
        const artists = parseCommaSeparatedArtists(trailingParen.artist);
        return {
          artists: artists.length > 0 ? artists : [trailingParen.artist],
          title: trailingParen.song,
        };
      }
    }
    const fromStored = parseCommaSeparatedArtists(a);
    const artists = fromStored.length > 0 ? fromStored : a ? [a] : [''];
    return { artists, title: cleanMyListSongTitle(t) };
  }

  let leftSeg = splitRaw.left;
  let rightSeg = splitRaw.right;
  if (shouldSwapMylistHyphenOrderForSongFirst(leftSeg, rightSeg, a)) {
    leftSeg = splitRaw.right;
    rightSeg = splitRaw.left;
  }

  const rawArtistBlob = normalizeSpaces(leftSeg);
  const artistsFromTitle = parseCommaSeparatedArtists(rawArtistBlob);
  const artistList =
    artistsFromTitle.length > 0 ? artistsFromTitle : rawArtistBlob ? [rawArtistBlob] : [''];
  const cleanedSong = cleanMyListSongTitle(rightSeg);

  if (artistList.length > 0 && artistList[0] && cleanedSong.length > 0) {
    const blobLower = rawArtistBlob.toLowerCase();
    if (isLikelyYoutubeChannelUploader(a)) {
      return { artists: artistList, title: cleanedSong };
    }
    if (!a) {
      return { artists: artistList, title: cleanedSong };
    }
    if (a.toLowerCase() === blobLower) {
      return { artists: artistList, title: cleanedSong };
    }
    /** 保存済みがカンマ区切り複数で、タイトル左側と一致 */
    const storedParts = parseCommaSeparatedArtists(a);
    if (
      storedParts.length > 1 &&
      storedParts.map((x) => x.toLowerCase()).join(', ') ===
        artistList.map((x) => x.toLowerCase()).join(', ')
    ) {
      return { artists: artistList, title: cleanedSong };
    }
    /**
     * 作者が VEVO/Topic 等と判定されず、上の一致にも当たらない（nikos791 等の個人アカウント再投稿）。
     * このとき oEmbed 作者をアーティストにすると「nikos791 - Parov Stelar - Diamonds」になるため、
     * タイトル「左 - 右」を優先する。
     */
    return { artists: artistList, title: cleanedSong };
  }

  const fromStored = parseCommaSeparatedArtists(a);
  const artists = fromStored.length > 0 ? fromStored : a ? [a] : [''];
  return { artists, title: cleanMyListSongTitle(t) };
}

/** フォーム配列 → DB の単一 artist 列（カンマ+空白区切り） */
export function joinMyListArtistsForStorage(artists: string[]): string {
  return artists.map((s) => s.trim()).filter(Boolean).join(', ');
}

/** `YT_ARTIST_TITLE_MODE=mylist_oembed` 用: oEmbed の author_name + title をマイリスト編集と同じ規則で pack 形にする */
export function resolveOEmbedToMyListStylePack(
  oembedTitle: string,
  channelAuthorName: string | null | undefined,
): { artist: string | null; artistDisplay: string | null; song: string } {
  const rawTitleOriginal = (oembedTitle ?? '').trim();
  let strippedLeadingAuthorPrefix = false;
  const rawTitle = (() => {
    const t = rawTitleOriginal;
    const authorRaw = (channelAuthorName ?? '').trim();
    const normRaw = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const authorRawNorm = normRaw(authorRaw);
    if (!t || !authorRawNorm) return t;
    const parts = t.split(FIRST_DASH_LOOSE).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 3) return t;
    const headRaw = (parts[0] ?? '').trim();
    if (!headRaw) return t;
    if (normRaw(headRaw) !== authorRawNorm) return t;
    strippedLeadingAuthorPrefix = true;
    return parts.slice(1).join(' - ').trim() || t;
  })();
  const suggested = suggestMyListArtistTitleFromYoutubeStyle(
    strippedLeadingAuthorPrefix ? null : channelAuthorName,
    rawTitle || null,
  );
  const displayBlob = joinMyListArtistsForStorage(suggested.artists)
    .split(',')
    .map((x) => cleanAuthor(x.trim()))
    .filter(Boolean)
    .join(', ')
    .trim();
  let song = (suggested.title ?? '').trim();
  if (!song && rawTitle) song = cleanMyListSongTitle(rawTitle);
  if (!song) song = rawTitleOriginal;

  const artistDisplay = displayBlob.length > 0 ? getArtistDisplayString(displayBlob) || displayBlob : null;
  const artist =
    artistDisplay && artistDisplay.length > 0 ? getMainArtist(artistDisplay) || artistDisplay : null;

  return { artist, artistDisplay, song };
}
