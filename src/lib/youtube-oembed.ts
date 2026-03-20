/**
 * YouTube oEmbed でタイトル・チャンネル名を取得（サーバー専用）
 */

const YOUTUBE_OEMBED = 'https://www.youtube.com/oembed';

export interface OEmbedResult {
  title?: string;
  author_name?: string;
}

export async function fetchOEmbed(
  videoId: string
): Promise<OEmbedResult | null> {
  const url = `${YOUTUBE_OEMBED}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = (await res.json()) as OEmbedResult;
    return data;
  } catch {
    return null;
  }
}
