/**
 * oEmbed の title / author_name を「アーティスト - タイトル」形式に整形。
 * タイトルに「アーティスト - 曲名」が含まれる場合はそれを優先（チャンネル名はアーティストと限らないため）。
 * ref: YTtoWP-YouTube動画をWP新規投稿で開く.js（区切り文字・引用符・不要語の除去を参考）
 */

/** アーティスト - 曲名 の区切り（ハイフン・enダッシュ・emダッシュ・水平線） */
const ARTIST_TITLE_SEPARATOR = /\s*[-\u2013\u2014\u2015]\s*/;

export function cleanTitle(title: string): string {
  let t = title
    .replace(/\s*\(Official Video\)\s*/gi, ' ')
    .replace(/\s*\(Official Audio\)\s*/gi, ' ')
    .replace(/\s*\(Lyric Video\)\s*/gi, ' ')
    .replace(/\s*\(Music Video\)\s*/gi, ' ')
    .replace(/\s*\(Official Music Video\)\s*/gi, ' ')
    .replace(/\s*\(Audio\)\s*/gi, ' ')
    .replace(/\s*\(Lyrics\)\s*/gi, ' ')
    .replace(/\s*\(Official Visualizer\)\s*/gi, ' ')
    .replace(/\s*\(\d{4}\)\s*/g, ' ')
    .replace(/\s*\[Official Music Video\]\s*/gi, ' ')
    .replace(/\s*\[Official Lyric Video\]\s*/gi, ' ')
    .replace(/\s*\[Official Video\]\s*/gi, ' ')
    .replace(/\s*\[Audio\]\s*/gi, ' ')
    .replace(/\s*\[Lyrics\]\s*/gi, ' ')
    .replace(/\s*\[HD\]\s*/gi, ' ')
    .replace(/\s*\[4K\]\s*/gi, ' ')
    .replace(/\s*\[Explicit\]\s*/gi, ' ')
    .replace(/\s*\[Clean\]\s*/gi, ' ')
    .replace(/\s*\[Radio Edit\]\s*/gi, ' ')
    .replace(/\s*\|\s*Vevo\s*/gi, ' ')
    .replace(/\s*\|\s*[^|]*$/g, ' ')
    .replace(/\s*-\s*Official[^-]*$/gi, ' ')
    .replace(/\s*\([^)]*Official[^)]*\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

/** YouTube のオフィシャル・Topic チャンネル名の末尾を除去してアーティスト名にする */
export function cleanAuthor(author: string): string {
  return author
    .replace(/\s*-\s*Topic\s*$/i, '') // "Prince - Topic" → "Prince"
    .replace(/\s*VEVO\s*$/i, '')
    .replace(/\s*Official\s*$/i, '')
    .trim();
}

/**
 * チャンネル名が「個人のアップロード者」っぽいか。
 * 他者の曲を上げている個人チャンネル（例: Nicolas Fernandez）を
 * アーティストとして表示しないため、フォールバックで使う。
 */
export function isLikelyPersonalChannelName(name: string): boolean {
  const s = name.trim();
  if (!s || s.length > 40) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length !== 2) return false;
  const bandIndicators = ['the', 'and', 'band', 'official', 'topic', 'vevo', 'music', 'records', '&'];
  const lower = s.toLowerCase();
  if (bandIndicators.some((w) => lower.includes(w))) return false;
  const [a, b] = words;
  return Boolean(a && b && a.length >= 2 && b.length >= 2 && /^[A-Z]/.test(a) && /^[A-Z]/.test(b));
}

/** feat./ft./featuring/with の括弧・角括弧ブロックを除去する正規表現 */
const FEAT_BLOCK = /\s*[(\[]\s*(feat\.?|ft\.?|fet\.?|featuring|with|w\/?)\s+[^)\]]+[)\]]\s*/gi;
/** feat./ft./featuring/with で区切る（非キャプチャにし、split の結果に ft. 等が含まれないようにする） */
const FEAT_SEPARATOR = /\s+(?:ft\.?|feat\.?|fet\.?|featuring|with|w\/?)\s+/i;
/** 表示用リストから除外する区切り語（ft. 等が混入した場合のフォールバック） */
const FEAT_WORDS = /^(?:ft\.?|feat\.?|fet\.?|featuring|with|w\/?)$/i;

/**
 * 複数アーティスト表記からメインアーティストを特定する。
 * 例: "Main Artist ft. Featured" → "Main Artist"
 *     "Main Artist (feat. X)" → "Main Artist"
 *     "A & B" / "A and B" / "A x B" → 先頭の "A"
 */
export function getMainArtist(artistPart: string): string {
  let main = artistPart.trim();
  if (!main) return main;
  main = main.replace(FEAT_BLOCK, ' ').replace(/\s+/g, ' ').trim();
  const byFeat = main.split(FEAT_SEPARATOR);
  main = (byFeat[0] ?? main).trim();
  const byAmp = main.split(/\s+&\s+/);
  main = (byAmp[0] ?? main).trim();
  const byAnd = main.split(/\s+and\s+/i);
  main = (byAnd[0] ?? main).trim();
  const byX = main.split(/\s+x\s+/);
  main = (byX[0] ?? main).trim();
  return main || artistPart.trim();
}

/**
 * 複数アーティスト表記を「Artist1, Artist2, Artist3」の形に展開（表示用）。
 * ft./feat./&/and/x/カンマ で分割し、各要素を trim してカンマ区切りで返す。
 */
export function getArtistDisplayString(artistPart: string): string {
  let s = artistPart.replace(FEAT_BLOCK, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return artistPart.trim();
  const parts = s
    .split(FEAT_SEPARATOR)
    .flatMap((p) => p.split(/\s+&\s+/))
    .flatMap((p) => p.split(/\s+and\s+/i))
    .flatMap((p) => p.split(/\s+x\s+/))
    .flatMap((p) => p.split(',').map((x) => x.trim()).filter(Boolean))
    .map((p) => p.trim())
    .filter((p) => Boolean(p) && !FEAT_WORDS.test(p));
  const seen = new Set<string>();
  const uniq = parts.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return uniq.join(', ') || artistPart.trim();
}

/**
 * タイトルからアーティストと曲名を分解。
 * 1) Artist "Song" / Artist 'Song' の引用符パターン
 * 2) 区切り（ - / – / — / ―）で分割（最初の区切りで artist / 残りを song）
 * 取れなければ null
 */
export function parseArtistTitle(title: string): { artist: string; song: string } | null {
  const raw = title.trim();
  if (!raw) return null;

  // 引用符: Artist "Song Title" または Artist 'Song Title'
  const doubleQuote = raw.match(/^([^"]+)\s+"([^"]+)"\s*$/);
  if (doubleQuote) {
    const artist = doubleQuote[1].trim();
    const song = cleanTitle(doubleQuote[2]);
    if (artist && song) return { artist, song };
  }
  const singleQuote = raw.match(/^([^']+)\s+'([^']+)'\s*$/);
  if (singleQuote) {
    const artist = singleQuote[1].trim();
    const song = cleanTitle(singleQuote[2]);
    if (artist && song) return { artist, song };
  }

  // 区切り（Unicode ダッシュ含む）で分割。最初の区切りだけ使い、残りは曲名として結合
  const parts = raw.split(ARTIST_TITLE_SEPARATOR).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    let artist = parts[0];
    let songRaw = parts.slice(1).join(' - ');
    // 曲名側に " ft. X" / " feat. X" があれば、曲名はその前だけにし、X はアーティストに含める
    // ※ 単独の "with" は含めない。「Be With You」「Walk with Me」等を誤って feat 扱いしないため
    const featInSong = songRaw.match(/^(.+?)\s+(ft\.?|feat\.?|fet\.?|featuring|w\/?)\s+(.+)$/i);
    if (featInSong) {
      const songOnly = featInSong[1].trim();
      const featured = featInSong[3].trim();
      if (songOnly && featured) {
        artist = `${artist} ft. ${featured}`;
        songRaw = songOnly;
      }
    }
    const song = cleanTitle(songRaw);
    if (artist && song) return { artist, song };
  }
  return null;
}

/**
 * 説明文から「アーティスト - 曲名」形式の行を探す（YouTube 説明の1行目付近によくある）。
 * "Provided to YouTube by" などの行はスキップする。
 */
export function parseArtistTitleFromDescription(description: string): { artist: string; song: string } | null {
  if (!description || !description.trim()) return null;
  const providedBy = /^\s*provided\s+to\s+youtube\s+by\s+/i;
  const lines = description.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length < 4 || providedBy.test(line)) continue;
    const parsed = parseArtistTitle(line);
    if (parsed) return parsed;
  }
  return null;
}

const normKey = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * タイトルから取った曲名に、客演っぽい語（with / and / & / feat）が含まれる可能性があるか。
 * このとき概要欄の単独曲名と突き合わせる（「Be With You」の with を誤爆しやすい）。
 */
export function songTitleMayNeedDescriptionCrossCheck(song: string): boolean {
  const s = song.trim();
  if (!s) return false;
  if (/\b(ft\.|feat\.|fet\.|featuring)\b/i.test(s)) return true;
  if (/\bwith\b/i.test(s)) return true;
  if (/\band\b/i.test(s)) return true;
  if (/\s&\s/.test(s)) return true;
  return false;
}

/**
 * 概要欄の「曲名, Out Now」系1行目から曲名だけ抜く（公式MVの定型）。
 */
export function extractPromotionalSongTitleFromDescription(description: string): string | null {
  if (!description?.trim()) return null;
  const providedBy = /^\s*provided\s+to\s+youtube\s+by\s+/i;
  const lines = description.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const promoLineRe =
    /^(.{2,100}?),\s*(Out Now|Available Now|Streaming Now|New Single|New Music|Listen Now|Watch Now|配信中|ストリーミング中|先行配信)\b/i;

  for (const line of lines) {
    if (line.length < 3 || providedBy.test(line)) continue;
    if (/^https?:\/\//i.test(line)) continue;
    const m = line.match(promoLineRe);
    if (m?.[1]) {
      const candidate = m[1].trim();
      if (candidate.length >= 2 && !/^[\d\s.,]+$/.test(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * 概要のプロモ行の曲名と、タイトル由来の曲名を突き合わせてより信頼できる表記にする。
 * - 正規化後一致 → 概要側の表記（表記ゆれ統一）
 * - 概要の方が長く、タイトル側がその前方一致（例: 「Be」→「Be With You」）→ 概要を採用
 */
export function refineSongTitleWithDescription(
  songFromTitle: string,
  description: string | null | undefined
): string {
  if (!description?.trim() || !songTitleMayNeedDescriptionCrossCheck(songFromTitle)) {
    return songFromTitle;
  }
  const fromDesc = extractPromotionalSongTitleFromDescription(description);
  if (!fromDesc) return songFromTitle;

  const nt = normKey(songFromTitle);
  const nd = normKey(fromDesc);
  if (nd === nt) return fromDesc.trim();
  if (nd.startsWith(nt) && fromDesc.trim().length > songFromTitle.trim().length) {
    return fromDesc.trim();
  }
  return songFromTitle;
}

export type GetArtistAndSongOptions = {
  /** YouTube Data API の snippet.description（取れるときだけ） */
  videoDescription?: string | null;
};

/**
 * YouTube 公式MVの説明に多い定型: "Music video by Kendrick Lamar, SZA performing luther."
 */
export function parsePerformingFromDescription(description: string): { artist: string; song: string } | null {
  if (!description?.trim()) return null;
  const m = description.match(
    /(?:music\s+)?video\s+by\s+(.+?)\s+performing\s+([^\n.©]+?)(?:\s*[.©]|\s*$)/i,
  );
  if (!m?.[1] || !m?.[2]) return null;
  const artist = m[1].replace(/\s+/g, ' ').trim();
  const song = m[2].replace(/\s+/g, ' ').trim();
  if (!artist || !song || artist.length > 120 || song.length > 120) return null;
  return { artist, song };
}

/**
 * 表示・AI用にアーティストと曲名を取得。
 * artist: メインアーティスト（AI・スタイル用）
 * artistDisplay: 表示用（複数はカンマ区切り。「アーティスト - 曲名」の先頭に使う）
 */
export function getArtistAndSong(
  title: string,
  authorName?: string | null,
  options?: GetArtistAndSongOptions
): { artist: string | null; artistDisplay: string | null; song: string } {
  const desc = options?.videoDescription;
  if (desc?.trim()) {
    const perf = parsePerformingFromDescription(desc);
    if (perf) {
      const artistPart = perf.artist;
      const songPart = cleanTitle(perf.song);
      if (artistPart && songPart) {
        return {
          artist: getMainArtist(artistPart) || artistPart,
          artistDisplay: getArtistDisplayString(artistPart) || null,
          song: refineSongTitleWithDescription(songPart, desc),
        };
      }
    }
  }

  const cleaned = cleanTitle(title);
  const parsed = parseArtistTitle(title);
  if (parsed) {
    // 逆パターン対策:
    // 日本のPVや一部チャンネルで「曲名 - アーティスト」になっていることがある。
    // 例: "Heal the World - Music Travel Love & Friends (Al Madam, UAE)"
    // authorName（チャンネル名）と照合して、右側がアーティストっぽければ入れ替える。
    const channel = authorName && cleanAuthor(authorName) ? cleanAuthor(authorName) : null;
    const ch = (channel ?? '').trim();

    const left = parsed.artist.trim(); // parseArtistTitle上は artist 扱い（左側）
    const right = parsed.song.trim();  // parseArtistTitle上は song 扱い（右側）

    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const chNorm = norm(ch);
    const leftNorm = norm(left);
    const rightNorm = norm(right);

    const channelLooksLikeRight =
      Boolean(chNorm) &&
      (rightNorm === chNorm ||
        rightNorm.startsWith(chNorm + ' ') ||
        rightNorm.startsWith(chNorm + '&') ||
        rightNorm.startsWith(chNorm + ' (') ||
        rightNorm.includes(chNorm + ' &') ||
        rightNorm.includes(chNorm + ' and'));

    const channelLooksLikeLeft =
      Boolean(chNorm) &&
      (leftNorm === chNorm ||
        leftNorm.startsWith(chNorm + ' ') ||
        leftNorm.startsWith(chNorm + '&') ||
        leftNorm.startsWith(chNorm + ' (') ||
        leftNorm.includes(chNorm + ' &') ||
        leftNorm.includes(chNorm + ' and'));

    // 左側が「曲名っぽい」か（MV系の接尾辞や括弧付きなども含めて判定）
    const looksLikeSongTitle = (s: string) => {
      const x = s.trim();
      if (!x) return false;
      // アーティストっぽい区切り語が少なく、文字数が極端に長くないものは曲名側に寄せる
      if (x.length <= 3) return false;
      // "Official Video" 等が含まれても曲名側であることが多いので、ここでは除外しない
      return true;
    };

    // 右側が「アーティストっぽい」か（短め／人名・バンド名に出やすい記号程度）
    const looksLikeArtistName = (s: string) => {
      const x = s.trim();
      if (!x) return false;
      if (x.length <= 2) return false;
      if (x.length > 60) return false;
      // 年や解説の断片は避ける
      if (/\b(19\d{2}|20\d{2})\b/.test(x)) return false;
      // MV/歌詞などは曲名側に寄ることが多い
      if (/(official|music video|lyric|lyrics|hd|4k|remaster|live|cover)\b/i.test(x)) return false;
      // 記号はバンド名であり得る範囲だけ許容
      if (!/^[A-Za-z0-9 '&.\-]+$/.test(x)) return false;
      return true;
    };

    const multiArtistOnRight = /\s&\s|\sand\s/i.test(right);
    const multiArtistOnLeft = /\s&\s|\sand\s/i.test(left);

    // 3) チャンネル名が取れない oEmbed 等で「曲名 - A & B」（左短・右に複数アーティスト）と誤認されるのを直す
    const shouldSwapTitleArtistOrder =
      !chNorm &&
      multiArtistOnRight &&
      !multiArtistOnLeft &&
      looksLikeArtistName(right) &&
      looksLikeSongTitle(left) &&
      left.length < right.length;

    // swap条件:
    // 1) チャンネル名が右側に含まれる（強い根拠）
    // 2) もしくは、右がアーティストっぽく左が曲名っぽい（Linkin Park等の公式MVで多い）
    // 3) 上記 shouldSwapTitleArtistOrder
    const shouldSwap =
      (channelLooksLikeRight && !channelLooksLikeLeft && looksLikeSongTitle(left)) ||
      (!channelLooksLikeLeft && looksLikeArtistName(right) && looksLikeSongTitle(left) && left.length >= right.length) ||
      shouldSwapTitleArtistOrder;

    const artistPart = shouldSwap ? right : left;
    const songPart = shouldSwap ? left : right;

    const mainArtist = getMainArtist(artistPart);
    const artistDisplay = getArtistDisplayString(artistPart);
    const songClean = cleanTitle(songPart);
    const song = refineSongTitleWithDescription(songClean, options?.videoDescription);
    return {
      artist: mainArtist || artistPart,
      artistDisplay: artistDisplay || null,
      // swap した場合、左側は raw なので不要語を除去して曲名を整える
      song,
    };
  }
  const channel = authorName && cleanAuthor(authorName) ? cleanAuthor(authorName) : null;
  const useChannelAsArtist = channel && !isLikelyPersonalChannelName(channel);
  const songFallback = refineSongTitleWithDescription(cleaned, options?.videoDescription);
  return {
    artist: useChannelAsArtist ? getMainArtist(channel) : null,
    artistDisplay: useChannelAsArtist ? channel : null,
    song: songFallback,
  };
}

/**
 * @param videoDescription YouTube Data API の snippet.description（取れるとき）。
 *   「Music video by … performing …」を最優先し、oEmbed だけの逆転表示を防ぐ。
 */
export function formatArtistTitle(
  title: string,
  authorName?: string | null,
  videoDescription?: string | null,
): string {
  const cleaned = cleanTitle(title);
  const opts = videoDescription?.trim() ? { videoDescription } : undefined;

  if (!authorName) {
    if (opts) {
      const { artistDisplay, song } = getArtistAndSong(cleaned, null, opts);
      if (artistDisplay && song) return `${artistDisplay} - ${song}`;
    }
    return cleaned;
  }

  const author = cleanAuthor(authorName);
  if (!author || isLikelyPersonalChannelName(author)) {
    if (opts) {
      const { artistDisplay, song } = getArtistAndSong(cleaned, null, opts);
      if (artistDisplay && song) return `${artistDisplay} - ${song}`;
    }
    return cleaned;
  }

  if (opts) {
    const { artistDisplay, song } = getArtistAndSong(cleaned, author, opts);
    if (artistDisplay && song) return `${artistDisplay} - ${song}`;
  }

  // 既に区切りがある場合でも、「曲名 - アーティスト」逆パターンを正規化して表示する
  if (ARTIST_TITLE_SEPARATOR.test(cleaned)) {
    const { artistDisplay, song } = getArtistAndSong(cleaned, author, undefined);
    if (artistDisplay && song) return `${artistDisplay} - ${song}`;
    return cleaned;
  }

  return `${author} - ${cleaned}`;
}
