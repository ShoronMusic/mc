import type { ChatMessage } from '@/types/chat';

const KEYWORD_LINE_RE = /【キーワード】\s*([^\n\r]+)/;

/**
 * いま再生中の seed videoId に紐づく「次に聴くなら」メッセージのうち、
 * 時系列で最初の 1 件の YouTube 検索用クエリ（【キーワード】行）を返す。
 */
export function extractFirstNextSongRecommendSearchQuery(
  messages: Pick<ChatMessage, 'messageType' | 'aiSource' | 'nextSongRecommendPending' | 'body' | 'videoId'>[],
  seedVideoId: string,
): string | null {
  const vid = seedVideoId.trim();
  if (!vid) return null;
  for (const m of messages) {
    if (m.messageType !== 'ai' || m.aiSource !== 'next_song_recommend') continue;
    if (m.nextSongRecommendPending === true) continue;
    if ((m.videoId ?? '').trim() !== vid) continue;
    const body = typeof m.body === 'string' ? m.body : '';
    const match = body.match(KEYWORD_LINE_RE);
    const q = match?.[1]?.trim();
    if (q) return q;
  }
  return null;
}

/** おすすめ1曲目の貼り付け依頼か（LLM 選曲より先におすすめキーワードを使う） */
export function isPasteNextSongFromRecommendIntent(text: string): boolean {
  const t = text.trim();
  return /(次の曲|貼って|貼り付け)/.test(t);
}
