/**
 * YouTube URL から videoId を抽出する
 */

const YOUTUBE_REGEX =
  /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractVideoId(url: string): string | null {
  const match = url.trim().match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

export function isYouTubeUrl(text: string): boolean {
  return extractVideoId(text) !== null;
}

/** http(s) の絶対URLか（YouTube かどうかは問わない） */
export function isHttpOrHttpsUrl(text: string): boolean {
  const t = text.trim();
  if (!/^https?:\/\//i.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 1行・空白なしで「URL1本だけ」に見える入力を http(s) 形式に正規化する。
 * （例: www.yahoo.co.jp/ → https://www.yahoo.co.jp/）
 */
export function normalizeToAbsoluteUrlIfStandalone(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^www\./i.test(t)) return `https://${t}`;
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/[^\s]*)?$/i.test(t)) {
    return `https://${t}`;
  }
  return null;
}

/** 上記の「URL1本」かつ YouTube 動画リンクでない（プレイヤー非対応の共有URL） */
export function isStandaloneNonYouTubeUrl(text: string): boolean {
  const abs = normalizeToAbsoluteUrlIfStandalone(text);
  if (!abs) return false;
  return extractVideoId(abs) === null;
}
