/**
 * YouTube プレイリスト URL のクライアント安全な判定・ID 抽出。
 */

const YOUTUBE_PLAYLIST_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

const YOUTUBE_PLAYLIST_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);

export type YoutubePlaylistUrlParseResult = {
  playlistId: string;
  canonicalUrl: string;
};

export function parseYoutubePlaylistUrl(raw: string): YoutubePlaylistUrlParseResult | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase();
    if (!YOUTUBE_PLAYLIST_HOSTS.has(host)) return null;
    const playlistId = url.searchParams.get('list')?.trim() ?? '';
    if (!YOUTUBE_PLAYLIST_ID_RE.test(playlistId)) return null;
    return {
      playlistId,
      canonicalUrl: `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`,
    };
  } catch {
    return null;
  }
}

export function isYoutubePlaylistUrl(raw: string): boolean {
  return parseYoutubePlaylistUrl(raw) !== null;
}
