import { extractVideoId } from '@/lib/youtube';

/**
 * YouTube 動画 URL を `https://www.youtube.com/watch?v=` 形式に正規化する。
 * 拡張 `content-youtube.js` の canonicalYouTubeWatchUrl と同等の意図。
 */
export function canonicalYouTubeWatchUrl(urlString: string): string | null {
  const raw = urlString.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split(/[/?#]/)[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return `https://www.youtube.com/watch?v=${id}`;
      }
    }
    if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'music.youtube.com') {
      const shorts = u.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (shorts?.[1] && /^[a-zA-Z0-9_-]{11}$/.test(shorts[1])) {
        return `https://www.youtube.com/watch?v=${shorts[1]}`;
      }
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
        return `https://www.youtube.com/watch?v=${v}`;
      }
    }
  } catch {
    /* ignore */
  }
  const id = extractVideoId(raw);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"']+/gi;

/** Web Share Target の url / text / title から最初の YouTube watch URL を得る */
export function resolveYouTubeWatchUrlFromSharePayload(input: {
  url?: string | null;
  text?: string | null;
  title?: string | null;
}): string | null {
  const fields = [input.url, input.text, input.title];
  for (const field of fields) {
    if (typeof field !== 'string' || !field.trim()) continue;
    const trimmed = field.trim();
    const direct = canonicalYouTubeWatchUrl(trimmed);
    if (direct) return direct;
    const matches = trimmed.match(URL_IN_TEXT_RE);
    if (!matches) continue;
    for (const m of matches) {
      const canon = canonicalYouTubeWatchUrl(m);
      if (canon) return canon;
    }
  }
  return null;
}
