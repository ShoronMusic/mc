/**
 * comment-pack の「邦楽節約」判定（追加の Gemini 呼び出しなし）。
 * タイトル・説明・チャンネル等に日本語が含まれる、または音声言語が ja のとき、
 * 基本コメント1本のみ生成し自由4本をスキップする（料金削減）。
 *
 * COMMENT_PACK_JP_ECONOMY=0 で無効（常に基本＋自由4本）。
 */

const JAPANESE_SCRIPT_RE =
  /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF]/;

export function textHasJapaneseScript(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false;
  return JAPANESE_SCRIPT_RE.test(s);
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

  const blob = [
    opts.title,
    opts.artistDisplay,
    opts.artist,
    opts.song,
    opts.description,
    opts.channelTitle,
  ]
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .join('\n');

  return textHasJapaneseScript(blob);
}
