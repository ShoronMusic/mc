/**
 * comment-pack の「邦楽節約」判定（追加の Gemini 呼び出しなし）。
 * 動画タイトル・アーティスト・曲名などの「主要メタ」に日本語がある、または音声言語が ja のとき、
 * 基本コメント1本のみ生成し自由4本をスキップする（料金削減）。
 *
 * 概要欄・チャンネル名だけに日本語がある場合（洋楽の来日公演で日本語の案内が付く等）は、
 * アーティスト名・曲名が英字主体で主要メタに日本語が無い限り邦楽扱いにしない（誤判定防止）。
 *
 * COMMENT_PACK_JP_ECONOMY=0 で無効（常に基本＋自由4本）。
 */

const JAPANESE_SCRIPT_RE =
  /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF]/;

export function textHasJapaneseScript(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false;
  return JAPANESE_SCRIPT_RE.test(s);
}

/** 主要メタが「英字主体の洋楽っぽい」か（概要欄だけ邦楽扱いにしないための補助） */
function primaryMetadataLooksWesternLatin(opts: {
  title: string;
  artistDisplay: string | null | undefined;
  artist: string | null | undefined;
  song: string | null | undefined;
}): boolean {
  const artistLike = (opts.artist ?? opts.artistDisplay ?? '').trim();
  const titleLike = (opts.song ?? opts.title ?? '').trim();
  if (artistLike.length < 2 || titleLike.length < 2) return false;
  const latinArtist = /[A-Za-z]/.test(artistLike);
  const latinTitle = /[A-Za-z]/.test(titleLike);
  if (!latinArtist || !latinTitle) return false;
  const primaryBlob = [opts.title, opts.artistDisplay, opts.artist, opts.song]
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .join('\n');
  return !textHasJapaneseScript(primaryBlob);
}

export function shouldUseJapaneseEconomyCommentPack(opts: {
  title: string;
  artistDisplay: string | null | undefined;
  artist: string | null | undefined;
  song: string | null | undefined;
  description: string | null | undefined;
  channelTitle: string | null | undefined;
  defaultAudioLanguage: string | null | undefined;
}): boolean {
  if (process.env.COMMENT_PACK_JP_ECONOMY === '0') return false;

  const lang = opts.defaultAudioLanguage?.trim().toLowerCase();
  if (lang && (lang === 'ja' || lang.startsWith('ja-'))) return true;

  const primaryBlob = [opts.title, opts.artistDisplay, opts.artist, opts.song]
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .join('\n');
  if (textHasJapaneseScript(primaryBlob)) return true;

  const secondaryBlob = [opts.description, opts.channelTitle]
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .join('\n');
  if (textHasJapaneseScript(secondaryBlob)) {
    if (primaryMetadataLooksWesternLatin(opts)) return false;
    return true;
  }

  return false;
}
