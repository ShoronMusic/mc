/**
 * oEmbed の title / author_name を「アーティスト - タイトル」形式に整形。
 * タイトルに「アーティスト - 曲名」が含まれる場合はそれを優先（チャンネル名はアーティストと限らないため）。
 * ref: YTtoWP-YouTube動画をWP新規投稿で開く.js（区切り文字・引用符・不要語の除去を参考）
 */

import { compoundArtistCanonicalIfKnown } from '@/lib/artist-compound-names';
import artistHyphenNamePrefixes from '@/config/artist-hyphen-name-prefixes.json';

/**
 * 曲名列に `artist-compound-extra` の合体アーティストだけが載り、アーティスト列には載っていない
 * （概要の performing 誤解析などで「Maneater / Daryl Hall & John Oates」が逆）とき、列を入れ替える。
 */
export function swapIfCompoundArtistStuckInSongSlot(
  artist: string | null,
  artistDisplay: string | null,
  song: string,
  videoDescription?: string | null,
): { artist: string | null; artistDisplay: string | null; song: string } {
  const colArtist = (artistDisplay ?? artist ?? '').trim();
  const colSong = song.trim();
  if (!colArtist || !colSong) return { artist, artistDisplay, song };
  if (!compoundArtistCanonicalIfKnown(colSong)) return { artist, artistDisplay, song };
  if (compoundArtistCanonicalIfKnown(colArtist)) return { artist, artistDisplay, song };
  const newArtistPart = colSong;
  const newSongPart = colArtist;
  const songClean = cleanTitle(newSongPart);
  const songOut =
    videoDescription != null && videoDescription.trim() !== ''
      ? refineSongTitleWithDescription(songClean, videoDescription)
      : songClean;
  return {
    artist: getMainArtist(newArtistPart) || newArtistPart,
    artistDisplay: getArtistDisplayString(newArtistPart) || null,
    song: songOut,
  };
}

/** アーティスト - 曲名 の区切り（ハイフン・enダッシュ・emダッシュ・水平線） */
const ARTIST_TITLE_SEPARATOR = /\s*[-\u2013\u2014\u2015]\s*/;

function readHyphenArtistPrefixes(): readonly string[] {
  const raw = artistHyphenNamePrefixes as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

const HYPHEN_ARTIST_TWO_SEGMENTS = readHyphenArtistPrefixes().filter((name) => {
  const segs = name.split('-');
  return segs.length === 2 && segs[0]!.trim() !== '' && segs[1]!.trim() !== '';
});

/**
 * 「a - ha - Take On Me」「a-ha - Take On Me」のように、ハイフン区切りで先頭2語が
 * 既知の「ハイフン入りアーティスト名」（例: a-ha）になるときだけ結合する。
 */
function mergeKnownHyphenArtistLeadingParts(parts: string[]): { artist: string; songParts: string[] } | null {
  if (parts.length < 3) return null;
  const a0 = parts[0]?.trim().toLowerCase() ?? '';
  const a1 = parts[1]?.trim().toLowerCase() ?? '';
  if (!a0 || !a1) return null;
  for (const canonical of HYPHEN_ARTIST_TWO_SEGMENTS) {
    const [s0, s1] = canonical.split('-');
    if (!s0 || !s1) continue;
    if (a0 === s0.trim().toLowerCase() && a1 === s1.trim().toLowerCase()) {
      return { artist: canonical, songParts: parts.slice(2) };
    }
  }
  return null;
}

/**
 * YouTube タイトルに付くリマスター・画質・配信向けの副題を除き、会話・AI プロンプト用の「曲名だけ」に近づける。
 * 楽曲の正式タイトルに意図的に含まれる括弧より、配信メタデータ側の付与を想定。
 */
function stripStreamingEditionMarkers(title: string): string {
  let t = title;
  const reList = [
    /\s*\[(?:4K|8K|2K|HD|UHD)\s+Remaster(?:ed)?\]\s*/gi,
    /\s*[\(（](?:4K|8K|2K|HD|UHD)\s+Remaster(?:ed)?[\)）]\s*/gi,
    /\s*[\(（]HD\s+Remaster(?:ed)?[\)）]\s*/gi,
    /\s*\[HD\s+Remaster(?:ed)?\]\s*/gi,
    /\s*[\(（]Remaster(?:ed)?(?:\s+\d{4})?[\)）]\s*/gi,
    /\s*[\(（]\d{4}\s+Remaster(?:ed)?[\)）]\s*/gi,
    /\s*\[Remaster(?:ed)?(?:\s+\d{4})?]\s*/gi,
    /\s*[\(（]Mastered\s+for\s+iTunes[\)）]\s*/gi,
    /\s*[\(（]Album\s+Version[\)）]\s*/gi,
    /\s*[\(（]Single\s+Version[\)）]\s*/gi,
    /\s*[\(（][^()（）]*\bVersion\b[^()（）]*[\)）]\s*$/gi,
    /\s*[\(（][^()（）]*\bMix\b[^()（）]*[\)）]\s*$/gi,
    /\s*[\(（][^()（）]*\bEdit\b[^()（）]*[\)）]\s*$/gi,
    /\s*[\(（][^()（）]*\bRemix\b[^()（）]*[\)）]\s*$/gi,
    /\s*[\(（]Radio\s+Edit[\)）]\s*/gi,
    /\s*[\(（]Extended\s+Version[\)）]\s*/gi,
    /\s*[\(（]Stereo\s+Mix[\)）]\s*/gi,
    /\s*[\(（]Mono\s+Version[\)）]\s*/gi,
  ];
  for (const re of reList) t = t.replace(re, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

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
    .replace(/\s*\[8K\]\s*/gi, ' ')
    .replace(/\s*\[2K\]\s*/gi, ' ')
    .replace(/\s*\[UHD\]\s*/gi, ' ')
    .replace(/\s*\[Explicit\]\s*/gi, ' ')
    .replace(/\s*\[Clean\]\s*/gi, ' ')
    .replace(/\s*\[Radio Edit\]\s*/gi, ' ')
    .replace(/\s*\|\s*Vevo\s*/gi, ' ')
    .replace(/\s*\|\s*[^|]*$/g, ' ')
    /** 「曲名 • TopPop」「曲名 · 番組名」など TV・ライブ番組のタグ（曲名の一部ではない） */
    .replace(/\s+[·•]\s+[^\n]+$/, ' ')
    .replace(/\s*-\s*Official[^-]*$/gi, ' ')
    .replace(/\s*\([^)]*Official[^)]*\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  t = stripStreamingEditionMarkers(t);
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

/** タイトル末尾の「| A COLORS SHOW」（https://www.youtube.com/@COLORSxSTUDIOS の定番フォーマット） */
const COLORS_SHOW_TITLE_SUFFIX = /\|\s*A\s+COLORS\s+SHOW\b/i;

/**
 * COLORS / COLORSxSTUDIOS 公式、または「… | A COLORS SHOW」タイトル。
 * oEmbed の「左 - 右」を常にアーティスト - 曲名として採用し、ヒューリスティックの左右入れ替えと MusicBrainz 順推定を行わない。
 */
export function colorsStudiosTrustsOembedArtistFirst(
  authorName: string | null | undefined,
  title: string,
): boolean {
  if (COLORS_SHOW_TITLE_SUFFIX.test((title ?? '').trim())) return true;
  const raw = (authorName ?? '').trim();
  if (!raw) return false;
  const n = cleanAuthor(raw).toLowerCase().replace(/\s+/g, ' ').trim();
  const compact = n.replace(/[^a-z0-9]/g, '');
  if (n === 'colors') return true;
  if (compact === 'colorsxstudios') return true;
  if (n.includes('colors x studios')) return true;
  if (/^colors\b/.test(n) && /\bstudios?\b/.test(n)) return true;
  return false;
}

/** https://www.youtube.com/channel/UCyFZMEnm1il5Wv3a6tPscbA — タイトルは「Genius - アーティスト "曲名" …」でチャンネル名が先頭に付く */
export function isGeniusChannelAuthor(authorName: string | null | undefined): boolean {
  const n = cleanAuthor((authorName ?? '').trim()).toLowerCase();
  return n === 'genius';
}

/**
 * タイトルが「Genius - …」で始まるときだけ接頭辞を外す（チャンネル名に依存しない。再アップ等でも同じパターンを救う）。
 */
export function stripGeniusBrandPrefixFromTitleIfPresent(title: string): {
  rest: string;
  hadGeniusBrandPrefix: boolean;
} {
  const raw = title.trim();
  const rest = raw.replace(/^\s*Genius\s*[-–—]\s*/i, '').trim();
  const hadGeniusBrandPrefix = rest.length >= 2 && rest !== raw;
  return { rest: hadGeniusBrandPrefix ? rest : raw, hadGeniusBrandPrefix };
}

/** Apple Music 公式など。タイトルは「Apple Music - アーティスト: "曲名" …」で主催者名が先頭 */
export function isAppleMusicChannelAuthor(authorName: string | null | undefined): boolean {
  const n = cleanAuthor((authorName ?? '').trim())
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return n === 'apple music' || /^apple music\b/.test(n);
}

/**
 * タイトルが「Apple Music - …」で始まるときだけ接頭辞を外す（再アップでも同パターンを救う）。
 */
export function stripAppleMusicBrandPrefixFromTitleIfPresent(title: string): {
  rest: string;
  hadAppleMusicBrandPrefix: boolean;
} {
  const raw = title.trim();
  const rest = raw.replace(/^\s*Apple\s+Music\s*[-–—]\s*/i, '').trim();
  const hadAppleMusicBrandPrefix = rest.length >= 2 && rest !== raw;
  return { rest: hadAppleMusicBrandPrefix ? rest : raw, hadAppleMusicBrandPrefix };
}

function normForArtistCompare(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * 曲名が「Artist: Song Title」のように、先頭でアーティスト名が再掲されている場合に
 * `Artist:` 部分だけ取り除き、二重表記を防ぐ。
 * 例: artist="Paramore", song="Paramore: Hard Times" -> "Hard Times"
 */
function stripRepeatedArtistColonPrefix(song: string, artist: string): string {
  const s = (song ?? '').trim();
  const a = (artist ?? '').trim();
  if (!s || !a) return song;

  const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*${esc}\\s*[:：]\\s*`, 'i');
  if (!re.test(s)) return song;
  return s.replace(re, '').trim();
}

/** Apple Music / Genius / COLORS のようにチャンネル名がレコーディング・アーティストと限らない配信元 */
export function isCuratorStyleChannel(
  authorName: string | null | undefined,
  title: string,
): boolean {
  return (
    isAppleMusicChannelAuthor(authorName) ||
    isGeniusChannelAuthor(authorName) ||
    colorsStudiosTrustsOembedArtistFirst(authorName, title)
  );
}

/**
 * レコーディング・アーティストをメタデータで信頼できないとき true（曲解説・comment-pack を生成しない）。
 * キュレーター公式チャンネルで、アップローダー名やプラットフォーム名だけがアーティスト扱いになっている場合を想定。
 * AI_COMMENTARY_ALLOW_UNCERTAIN_ARTIST=1 のときは判定を無効化（従来どおり生成する）。
 */
export function shouldSkipAiCommentaryForUncertainArtistResolution(params: {
  artist: string | null;
  artistDisplay: string | null;
  song: string | null | undefined;
  authorName: string | null | undefined;
  title: string;
}): boolean {
  if (process.env.AI_COMMENTARY_ALLOW_UNCERTAIN_ARTIST === '1') return false;

  const song = (params.song ?? '').trim();
  if (!song) return true;

  const label = (params.artistDisplay || params.artist || '').trim();
  if (!label) return true;

  const author = cleanAuthor((params.authorName ?? '').trim());
  const labelNorm = normForArtistCompare(label);
  const authorNorm = normForArtistCompare(author);

  if (isCuratorStyleChannel(params.authorName, params.title)) {
    if (authorNorm && labelNorm === authorNorm) return true;
    if (isAppleMusicChannelAuthor(params.authorName) && labelNorm === 'apple music') return true;
    if (isGeniusChannelAuthor(params.authorName) && labelNorm === 'genius') return true;
    if (colorsStudiosTrustsOembedArtistFirst(params.authorName, params.title) && labelNorm === 'colors') {
      return true;
    }
  }

  return false;
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
/**
 * feat. / ft. / featuring / w/ で区切る（非キャプチャにし、split の結果に ft. 等が含まれないようにする）。
 * 単独の英語「with」は含めない。「Die With A Smile」「Be With You」等の曲名・タイトルを
 * getMainArtist に渡したときに「Die」「Be」へ切り詰められる事故を防ぐため。
 * （括弧内の "(with X)" は FEAT_BLOCK で別処理）
 */
const FEAT_SEPARATOR = /\s+(?:ft\.?|feat\.?|fet\.?|featuring|w\/?)\s+/i;
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
  const compound = compoundArtistCanonicalIfKnown(main);
  if (compound) return compound;
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
  const compound = compoundArtistCanonicalIfKnown(s);
  if (compound) return compound;
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

/** YouTube 概要の日付・公開メタ行が「アーティスト - 曲名」と誤爆しないよう除外する */
function isYoutubeDescriptionMetadataLine(line: string): boolean {
  const s = line.trim();
  if (!s) return true;
  if (/^provided\s+to\s+youtube\s+by\b/i.test(s)) return true;
  if (/^released\s+on\s*:/i.test(s)) return true;
  if (/^premiered\s*:/i.test(s)) return true;
  if (/^published\s*:/i.test(s)) return true;
  if (/^posted\s*:/i.test(s)) return true;
  if (/^upload\s*date\s*:/i.test(s)) return true;
  if (/^auto-generated\s+by\s+youtube/i.test(s)) return true;
  return false;
}

/** 先頭セグメントが「Released on: 1973」のようにメタデータっぽい */
function looksLikeMetadataArtistSegment(artist: string): boolean {
  const a = artist.trim();
  if (!a) return true;
  if (/^released\s+on\b/i.test(a)) return true;
  if (/^premiered\b/i.test(a)) return true;
  if (/^published\b/i.test(a)) return true;
  if (/^posted\b/i.test(a)) return true;
  if (/^upload\s+date\b/i.test(a)) return true;
  if (/^date\s*:/i.test(a)) return true;
  if (/^listen\s+on\b/i.test(a)) return true;
  if (/^stream\s+on\b/i.test(a)) return true;
  if (/^\d{4}\s*$/.test(a)) return true;
  if (/^[\d\s:.\-–—/]+$/i.test(a) && /\d{4}/.test(a) && a.length < 40) return true;
  return false;
}

/** 「10 - 05」のような MM-DD 片だけが曲名扱いになった疑い（9 to 5 などの曲名は誤爆しないよう2桁同士に限定） */
function looksLikeMetadataSongSegment(song: string): boolean {
  const t = song.trim();
  if (!t) return true;
  if (/^\d{2}\s*[-–—]\s*\d{2}(\s*[-–—]\s*\d{2,4})?\s*$/i.test(t)) return true;
  if (/^\d{4}\s*[-–—]\s*\d{1,2}\s*[-–—]\s*\d{1,2}\s*$/.test(t)) return true;
  if (/^\d{4}\s*[-–—]\s*\d{1,2}\s*$/.test(t)) return true;
  return false;
}

export function isGarbageArtistSongParse(parsed: { artist: string; song: string }): boolean {
  if (looksLikeMetadataArtistSegment(parsed.artist)) return true;
  if (looksLikeMetadataSongSegment(parsed.song) && looksLikeMetadataArtistSegment(parsed.artist)) return true;
  return false;
}

/**
 * タイトルからアーティストと曲名を分解。
 * 1) Artist "Song" / Artist 'Song' の引用符パターン
 * 2) 区切り（ - / – / — / ―）で分割（最初の区切りで artist / 残りを song）
 * 取れなければ null
 * @param allowQuotedSongWithTrailingParens Genius 典型の「Artist "曲" (Live Performance)」のみ true（全体タイトルに付けると誤爆する）
 * @param allowColonQuotedSongWithTrailingParens Apple Music 典型の「Artist: "曲" (Live at …)」や「Artist: '曲' Live」のみ true
 */
export function parseArtistTitle(
  title: string,
  options?: {
    allowQuotedSongWithTrailingParens?: boolean;
    allowColonQuotedSongWithTrailingParens?: boolean;
  },
): { artist: string; song: string } | null {
  const raw0 = title.trim();
  if (!raw0) return null;
  const raw = raw0.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");

  // 引用符: Artist "Song Title" または Artist 'Song Title'
  const doubleQuote = raw.match(/^([^"]+)\s+"([^"]+)"\s*$/);
  if (doubleQuote) {
    const artist = doubleQuote[1].trim();
    const song = cleanTitle(doubleQuote[2]);
    if (artist && song) {
      const out = { artist, song };
      if (!isGarbageArtistSongParse(out)) return out;
    }
  }

  if (options?.allowQuotedSongWithTrailingParens) {
    // Genius 等: Artist "TITLE" (Live Performance) … | …（曲名直後に括弧付き副題や | が続く）
    const doubleQuoteWithTail = raw.match(
      /^(.+?)\s+"([^"]+)"\s*((?:\([^)]*\)\s*)*)(\s*\|\s*[^|]*)?\s*$/i,
    );
    if (doubleQuoteWithTail) {
      const artist = doubleQuoteWithTail[1].trim();
      const song = cleanTitle(doubleQuoteWithTail[2]);
      if (artist && song) {
        const out = { artist, song };
        if (!isGarbageArtistSongParse(out)) return out;
      }
    }
  }

  if (options?.allowColonQuotedSongWithTrailingParens) {
    // Apple Music 等: Artist: "TITLE" (Live at …) / Artist: 'TITLE' Live（括弧なしの Live も）
    const colonQuotedSuffixOk = (suffix: string) => {
      const t = suffix.trim();
      if (!t) return true;
      if (t.length > 120) return false;
      if (t.startsWith('(')) return true;
      if (t.startsWith('|')) return true;
      if (/^live\b/i.test(t)) return true;
      return false;
    };
    const colonDouble = raw.match(/^(.+?):\s+"([^"]+)"\s*(.*)$/i);
    if (colonDouble && colonQuotedSuffixOk(colonDouble[3] ?? '')) {
      const artist = colonDouble[1].trim();
      const song = cleanTitle(colonDouble[2]);
      if (artist && song) {
        const out = { artist, song };
        if (!isGarbageArtistSongParse(out)) return out;
      }
    }
    const colonSingle = raw.match(/^(.+?):\s+'([^']+)'\s*(.*)$/i);
    if (colonSingle && colonQuotedSuffixOk(colonSingle[3] ?? '')) {
      const artist = colonSingle[1].trim();
      const song = cleanTitle(colonSingle[2]);
      if (artist && song) {
        const out = { artist, song };
        if (!isGarbageArtistSongParse(out)) return out;
      }
    }
  }

  const singleQuote = raw.match(/^([^']+)\s+'([^']+)'\s*$/);
  if (singleQuote) {
    const artist = singleQuote[1].trim();
    const song = cleanTitle(singleQuote[2]);
    if (artist && song) {
      const out = { artist, song };
      if (!isGarbageArtistSongParse(out)) return out;
    }
  }

  // 区切り（Unicode ダッシュ含む）で分割。最初の区切りだけ使い、残りは曲名として結合
  const parts = raw.split(ARTIST_TITLE_SEPARATOR).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const hyphenMerged = mergeKnownHyphenArtistLeadingParts(parts);
    let artist = hyphenMerged ? hyphenMerged.artist : parts[0];
    let songRaw = hyphenMerged ? hyphenMerged.songParts.join(' - ') : parts.slice(1).join(' - ');
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
    if (artist && song) {
      const out = { artist, song };
      if (isGarbageArtistSongParse(out)) return null;
      return out;
    }
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
    if (line.length < 4 || providedBy.test(line) || isYoutubeDescriptionMetadataLine(line)) continue;
    const parsed = parseArtistTitle(line);
    if (parsed && !isGarbageArtistSongParse(parsed)) return parsed;
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
 * 別定型: Official Music Video for 'The Power of Love' performed by Huey Lewis and The News (…
 * 曲名・アーティストの順が parsePerformingFromDescription と逆。
 */
export function parseSongPerformedByFromDescription(description: string): { artist: string; song: string } | null {
  if (!description?.trim()) return null;
  const m = description.match(
    /\b(?:official\s+)?(?:music\s+)?video\s+for\s+(["'`\u2018\u2019\u201c\u201d])([^\r\n]+?)\1\s+performed\s+by\s+(.+?)\s*(?:\(|\.(?:\s|$)|\r?\n|$)/i,
  );
  if (!m?.[2] || !m?.[3]) return null;
  const song = m[2].replace(/\s+/g, ' ').trim();
  let artist = m[3].replace(/\s+/g, ' ').trim().replace(/\.$/, '');
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
    const perfInverted = perf ? null : parseSongPerformedByFromDescription(desc);
    const fromDesc = perf ?? perfInverted;
    if (fromDesc) {
      const artistPart = fromDesc.artist;
      const songPart = cleanTitle(fromDesc.song);
      if (artistPart && songPart) {
        const interim = {
          artist: getMainArtist(artistPart) || artistPart,
          artistDisplay: getArtistDisplayString(artistPart) || null,
          song: refineSongTitleWithDescription(songPart, desc),
        };
        return swapIfCompoundArtistStuckInSongSlot(interim.artist, interim.artistDisplay, interim.song, desc);
      }
    }
  }

  const cleaned = cleanTitle(title);
  let { rest: titleForParse, hadGeniusBrandPrefix } = stripGeniusBrandPrefixFromTitleIfPresent(title);
  let hadAppleMusicBrandPrefix = false;
  if (!hadGeniusBrandPrefix) {
    const apple = stripAppleMusicBrandPrefixFromTitleIfPresent(titleForParse);
    titleForParse = apple.rest;
    hadAppleMusicBrandPrefix = apple.hadAppleMusicBrandPrefix;
  }
  const allowQuotedTail =
    hadGeniusBrandPrefix || isGeniusChannelAuthor(authorName);
  const allowColonQuoted =
    hadAppleMusicBrandPrefix || isAppleMusicChannelAuthor(authorName);
  const parsed = parseArtistTitle(titleForParse, {
    allowQuotedSongWithTrailingParens: allowQuotedTail,
    allowColonQuotedSongWithTrailingParens: allowColonQuoted,
  });
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
    /** VEVO 等のスラッグ（georgemichael）とタイトル側の「名 姓」（george michael）を突き合わせる */
    const alnumCompact = (s: string) => norm(s).replace(/[^a-z0-9]/g, '');
    const MIN_CHANNEL_ALNUM_MATCH = 6;

    const chNorm = norm(ch);
    const leftNorm = norm(left);
    const rightNorm = norm(right);
    const chAc = alnumCompact(ch);
    const leftAc = alnumCompact(left);
    const rightAc = alnumCompact(right);

    const channelLooksLikeRight =
      Boolean(chNorm) &&
      (rightNorm === chNorm ||
        rightNorm.startsWith(chNorm + ' ') ||
        rightNorm.startsWith(chNorm + '&') ||
        rightNorm.startsWith(chNorm + ' (') ||
        rightNorm.includes(chNorm + ' &') ||
        rightNorm.includes(chNorm + ' and') ||
        (chAc.length >= MIN_CHANNEL_ALNUM_MATCH &&
          rightAc.length >= MIN_CHANNEL_ALNUM_MATCH &&
          chAc === rightAc));

    const channelLooksLikeLeft =
      Boolean(chNorm) &&
      (leftNorm === chNorm ||
        leftNorm.startsWith(chNorm + ' ') ||
        leftNorm.startsWith(chNorm + '&') ||
        leftNorm.startsWith(chNorm + ' (') ||
        leftNorm.includes(chNorm + ' &') ||
        leftNorm.includes(chNorm + ' and') ||
        (chAc.length >= MIN_CHANNEL_ALNUM_MATCH &&
          leftAc.length >= MIN_CHANNEL_ALNUM_MATCH &&
          chAc === leftAc));

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
      // 記号はバンド名であり得る範囲だけ許容（ATARASHII GAKKO! 等）
      if (!/^[A-Za-z0-9 '&.\-!?]+$/.test(x)) return false;
      return true;
    };

    /** 「ATARASHII GAKKO!」型。末尾 ! はバンド名側の手がかり（曲名 - バンド! の逆順を直す） */
    const hasTrailingBandExclamation = (s: string) => /![\s]*$/.test(s.trim());

    /** スペース無しの英数字1語がすべて大文字（SPECIALZ, DNA など）— 曲タイトルで多くアーティスト名誤認しやすい */
    const looksLikeStylizedCapsSongToken = (s: string) => {
      const x = s.trim();
      if (x.length < 2 || x.length > 48) return false;
      if (/\s/.test(x)) return false;
      if (!/^[A-Z0-9]+$/.test(x)) return false;
      return /[A-Z]/.test(x);
    };

    /** 左側が「複数語で各語が大文字始まり」など、アーティスト列の典型（King Gnu, Taylor Swift） */
    const leftLooksLikeMultiWordArtist = (() => {
      const parts = left
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0 && !FEAT_WORDS.test(w));
      if (parts.length < 2) return false;
      return parts.every((w) => /^[A-Za-z]/.test(w) && /^[A-Z]/.test(w[0] ?? ''));
    })();

    const multiArtistOnRight = /\s&\s|\sand\s/i.test(right);
    const multiArtistOnLeft = /\s&\s|\sand\s/i.test(left);
    /** 右が「HOTEL LOBBY」のように語ごと全大文字の曲タイトル（looksLikeArtistName に空白が入るため誤アーティスト化しやすい） */
    const rightIsAllCapsWordsTrackStyle = (() => {
      const w = right
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (w.length < 1) return false;
      return w.every((token) => /^[A-Z][A-Z0-9]*$/.test(token));
    })();

    // 左が複数語アーティスト・右がスタイル化された全大文字1語 → ほぼ確実に「アーティスト - 曲名」のまま（公式以外チャンネルで誤スワップしやすい）
    const keepArtistSongOrderForCapsTitle =
      leftLooksLikeMultiWordArtist && looksLikeStylizedCapsSongToken(right);

    /** 左が「Jorja Smith」型。ただし「Too Shy」のように先頭語が3文字以下の曲名も Title Case になり得るため、各語4文字以上で強アーティスト扱い */
    const leftStrongArtistWords = left
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0 && !FEAT_WORDS.test(w));
    const leftEveryArtistWordMinLen4 =
      leftStrongArtistWords.length >= 2 &&
      leftStrongArtistWords.every((w) => w.replace(/^[^\w]+|[^\w]+$/g, '').length >= 4);

    /** 「Quavo & Takeoff - HOTEL LOBBY」型: 左の & が leftLooksLikeMultiWordArtist を潰すため、右が全大語タイトルならアーティスト側を維持 */
    const leftLooksLikeStrongArtistCandidate =
      (leftLooksLikeMultiWordArtist &&
        looksLikeArtistName(left) &&
        leftEveryArtistWordMinLen4) ||
      (multiArtistOnLeft && looksLikeArtistName(left) && rightIsAllCapsWordsTrackStyle);

    /** 「Kehlani - Folded」のように左右がどちらも単語1つ＋COLORS 等でチャンネル不一致のとき、長さ条件スワップで誤るため抑止 */
    const bothSingleWordLatinArtistLike =
      !/\s/.test(left.trim()) &&
      !/\s/.test(right.trim()) &&
      looksLikeArtistName(left) &&
      looksLikeArtistName(right);

    /**
     * MV タイトルは「単語バンド名 - 複語曲名」が多く（Kajagoogoo - Too Shy）、左のほうが文字数で長いこともある。
     * 下の「左>=右なら曲先」と併用すると正しい順を誤スワップするため、長さ条件スワップから除外する。
     * 逆順「Too Shy - Kajagoogoo」は songFirstMultiWord… やチャンネル一致で救う。
     */
    const artistFirstLikelySingleLeftMultiWordRight =
      !/\s/.test(left.trim()) && /\s/.test(right.trim());

    // 両側とも全大文字1語のとき、長い方をアーティスト側に（YOASOBI - IDOL など。短い方だけを「アーティストっぽい」と誤判定しない）
    const bothStylizedCapsTokens =
      looksLikeStylizedCapsSongToken(left) && looksLikeStylizedCapsSongToken(right);
    const keepLongerCapsTokenLeftAsArtist =
      bothStylizedCapsTokens && left.length >= right.length;

    // 3) oEmbed が「曲名 - アーティスト」で、右に & / and（バンド名）・左に無いときは入れ替え。
    //    チャンネルが hueylewisofficial のようにアーティスト文字列と一致しないケースもここで救う。
    const shouldSwapTitleArtistOrder =
      !channelLooksLikeRight &&
      !channelLooksLikeLeft &&
      multiArtistOnRight &&
      !multiArtistOnLeft &&
      looksLikeArtistName(right) &&
      looksLikeSongTitle(left);

    // 4) 「Boom Boom Pow - The Black Eyed Peas」のように右が "The …" バンド名・左が曲名だが and/& が無いケース
    //    ただし "The Messiah Will Come Again" のような通常の曲名は誤スワップしないよう、
    //    語数と機能語で「バンド名っぽさ」を絞る。
    const rightTheWords = right
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const rightLooksLikeTheBandName =
      /^The\s+/i.test(right.trim()) &&
      rightTheWords.length >= 2 &&
      rightTheWords.length <= 4 &&
      !/\b(will|come|again|you|me|my|your|our|this|that|to|for|of|in|on)\b/i.test(right);
    const songFirstLeadingTheOnRight =
      !channelLooksLikeLeft &&
      looksLikeArtistName(right) &&
      looksLikeSongTitle(left) &&
      rightLooksLikeTheBandName &&
      !/^The\s+/i.test(left.trim());

    // 5) 「Too Shy - Kajagoogoo」型: 左が複語の曲名・右が1語のバンド名（右のほうが長い）。強アーティスト候補でないときだけ。
    const songFirstMultiWordLeftSingleWordRightLonger =
      !channelLooksLikeLeft &&
      !channelLooksLikeRight &&
      looksLikeArtistName(right) &&
      looksLikeSongTitle(left) &&
      /\s/.test(left.trim()) &&
      !/\s/.test(right.trim()) &&
      left.length < right.length &&
      alnumCompact(right).length > alnumCompact(left).length &&
      !leftLooksLikeStrongArtistCandidate &&
      !bothSingleWordLatinArtistLike;

    /**
     * 左だけが「A & B」デュオ表記のときは「アーティスト - 曲」が典型（Daryl Hall & John Oates - Maneater）。
     * leftLooksLikeStrongArtistCandidate が & を単語扱いして false になり、下の branch 2 だけで誤スワップするのを防ぐ。
     */
    const artistDuoFormLeftOnly = multiArtistOnLeft && !multiArtistOnRight;

    // swap条件:
    // 1) チャンネル名が右側に含まれる（強い根拠）
    // 2) もしくは、右がアーティストっぽく左が曲名っぽい（Linkin Park等の公式MVで多い）
    // 3) 上記 shouldSwapTitleArtistOrder
    // 4) 曲名 - The Beatles / The Black Eyed Peas 型（左が The で始まらないときのみ。Taylor Swift - Anti-Hero は誤スワップしない）
    // 5) 曲名 - 単語バンド名（Too Shy - Kajagoogoo）
    let shouldSwap =
      (channelLooksLikeRight && !channelLooksLikeLeft && looksLikeSongTitle(left)) ||
      (!channelLooksLikeLeft &&
        looksLikeArtistName(right) &&
        looksLikeSongTitle(left) &&
        left.length >= right.length &&
        !leftLooksLikeStrongArtistCandidate &&
        !bothSingleWordLatinArtistLike &&
        !artistFirstLikelySingleLeftMultiWordRight &&
        !artistDuoFormLeftOnly) ||
      shouldSwapTitleArtistOrder ||
      songFirstLeadingTheOnRight ||
      songFirstMultiWordLeftSingleWordRightLonger;

    if (keepArtistSongOrderForCapsTitle || keepLongerCapsTokenLeftAsArtist) {
      shouldSwap = false;
    }

    // 「バンド名! - 曲名」はそのまま、「曲名 - バンド名!」だけ入れ替え（! を looksLikeArtistName に入れても
    // 「Tokyo Calling」が右側アーティスト扱いされて誤スワップするため、末尾 ! で最終判定する）
    if (hasTrailingBandExclamation(left) && !hasTrailingBandExclamation(right)) {
      shouldSwap = false;
    } else if (
      hasTrailingBandExclamation(right) &&
      !hasTrailingBandExclamation(left) &&
      looksLikeSongTitle(left) &&
      looksLikeArtistName(right)
    ) {
      shouldSwap = true;
    }

    if (colorsStudiosTrustsOembedArtistFirst(authorName, title)) {
      shouldSwap = false;
    }

    const artistPart = shouldSwap ? right : left;
    const songPart = shouldSwap ? left : right;

    const mainArtist = getMainArtist(artistPart);
    const artistDisplay = getArtistDisplayString(artistPart);
    const songClean = cleanTitle(songPart);
    const song = refineSongTitleWithDescription(songClean, options?.videoDescription);
    const artistForStrip = mainArtist || artistPart;
    const songNormalized = stripRepeatedArtistColonPrefix(song, artistForStrip);
    return swapIfCompoundArtistStuckInSongSlot(
      mainArtist || artistPart,
      artistDisplay || null,
      songNormalized,
      options?.videoDescription ?? null,
    );
  }
  const channel = authorName && cleanAuthor(authorName) ? cleanAuthor(authorName) : null;
  const useChannelAsArtist = channel && !isLikelyPersonalChannelName(channel);
  const songFallback = refineSongTitleWithDescription(cleaned, options?.videoDescription);
  const artistForStrip = useChannelAsArtist ? getMainArtist(channel) ?? channel ?? '' : '';
  const songNormalized = stripRepeatedArtistColonPrefix(songFallback, artistForStrip);
  return swapIfCompoundArtistStuckInSongSlot(
    useChannelAsArtist ? getMainArtist(channel) : null,
    useChannelAsArtist ? channel : null,
    songNormalized,
    options?.videoDescription ?? null,
  );
}

/**
 * MusicBrainz 録音検索での順序補正用。getArtistAndSong 内の looksLikeArtistName と概ね同じ基準。
 */
export function segmentLooksLikeLatinArtistNameForMb(s: string): boolean {
  const x = s.trim();
  if (x.length < 4 || x.length > 60) return false;
  if (/\b(19\d{2}|20\d{2})\b/.test(x)) return false;
  if (/(official|music video|lyric|lyrics|hd|4k|remaster|live|cover)\b/i.test(x)) return false;
  if (!/^[A-Za-z0-9 '&.\-!?]+$/.test(x)) return false;
  return true;
}

/**
 * 概要欄でアーティスト確定できず、oEmbed の「左 - 右」がチャンネル名とどちらも一致せず、
 * 左右ともアーティストっぽいときだけ MusicBrainz で順序を当てにいく（1動画あたり最大2リクエスト・スロットル共有）。
 */
export function getAmbiguousTitleSegmentsForMusicBrainz(
  title: string,
  authorName: string | null | undefined,
  videoDescription: string | null | undefined,
): { left: string; right: string } | null {
  if (process.env.MUSICBRAINZ_TITLE_ORDER === '0') return null;
  if (colorsStudiosTrustsOembedArtistFirst(authorName, title)) return null;
  if (isGeniusChannelAuthor(authorName)) return null;
  if (isAppleMusicChannelAuthor(authorName)) return null;
  const { hadGeniusBrandPrefix } = stripGeniusBrandPrefixFromTitleIfPresent(title);
  if (hadGeniusBrandPrefix) return null;
  if (stripAppleMusicBrandPrefixFromTitleIfPresent(title).hadAppleMusicBrandPrefix) return null;
  const desc = videoDescription?.trim() ?? '';
  if (desc) {
    if (parsePerformingFromDescription(desc) || parseSongPerformedByFromDescription(desc)) {
      return null;
    }
  }
  const parsed = parseArtistTitle(title);
  if (!parsed) return null;
  const left = parsed.artist.trim();
  const right = parsed.song.trim();
  if (left.length < 2 || right.length < 2 || left.length > 100 || right.length > 100) return null;

  const channel = authorName && cleanAuthor(authorName) ? cleanAuthor(authorName) : null;
  const ch = (channel ?? '').trim();
  if (!ch) return null;

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const alnumCompact = (s: string) => norm(s).replace(/[^a-z0-9]/g, '');
  const MIN_CHANNEL_ALNUM_MATCH = 6;

  const chNorm = norm(ch);
  const leftNorm = norm(left);
  const rightNorm = norm(right);
  const chAc = alnumCompact(ch);
  const leftAc = alnumCompact(left);
  const rightAc = alnumCompact(right);

  const channelMatchesSegment = (segNorm: string, segAc: string) =>
    Boolean(chNorm) &&
    (segNorm === chNorm ||
      segNorm.startsWith(chNorm + ' ') ||
      segNorm.startsWith(chNorm + '&') ||
      segNorm.startsWith(chNorm + ' (') ||
      segNorm.includes(chNorm + ' &') ||
      segNorm.includes(chNorm + ' and') ||
      (chAc.length >= MIN_CHANNEL_ALNUM_MATCH &&
        segAc.length >= MIN_CHANNEL_ALNUM_MATCH &&
        chAc === segAc));

  if (channelMatchesSegment(leftNorm, leftAc) || channelMatchesSegment(rightNorm, rightAc)) {
    return null;
  }

  /**
   * 「Daryl Hall & John Oates - Maneater」のように**片側だけ**が「A & B」のデュオ表記のとき、
   * 公式タイトルは「アーティスト - 曲」がほぼ固定。両側が segmentLooksLikeLatinArtistNameForMb を通すと
   * MB が逆順を返し、アナウンスが「Maneater - Daryl Hall & John Oates」になることがあるため、ここでは順序推定しない。
   * （逆タイトル「Maneater - Daryl Hall & John Oates」は getArtistAndSong 側のスワップで救う。）
   */
  const hasAmpersandCollaborationForm = (s: string) => /\s&\s/.test(s.trim());
  if (hasAmpersandCollaborationForm(left) !== hasAmpersandCollaborationForm(right)) {
    return null;
  }

  if (!segmentLooksLikeLatinArtistNameForMb(left) || !segmentLooksLikeLatinArtistNameForMb(right)) {
    return null;
  }

  if (/![\s]*$/.test(left) || /![\s]*$/.test(right)) return null;

  return { left, right };
}

/** MusicBrainz で順序が決まったあと、getArtistAndSong と同様に整形 */
export function buildArtistSongFromTitleSegments(
  artistPart: string,
  songPart: string,
  videoDescription: string | null | undefined,
): { artist: string | null; artistDisplay: string | null; song: string } {
  const songClean = cleanTitle(songPart);
  const song = refineSongTitleWithDescription(songClean, videoDescription);
  const mainArtist = getMainArtist(artistPart);
  const artistDisplay = getArtistDisplayString(artistPart);
  return {
    artist: mainArtist || artistPart,
    artistDisplay: artistDisplay || null,
    song,
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
