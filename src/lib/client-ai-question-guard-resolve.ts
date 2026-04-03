/**
 * ブラウザ用: 「@」本文がクライアントヒューリスティックで非音楽扱いのとき、API で再判定。
 */

import { isMusicRelatedAiQuestion } from '@/lib/is-music-related-ai-question';

export type GuardRecentMessage = {
  displayName?: string;
  body: string;
  messageType: string;
};

export type ResolveAiQuestionMusicRelatedResult =
  | { outcome: 'allow' }
  | { outcome: 'block' }
  | { outcome: 'defer'; message: string };

const DEFAULT_TIMEOUT_MS = 4500;

/**
 * @param aiPromptText 「@」を除いた質問本文
 */
export async function resolveAiQuestionMusicRelated(
  aiPromptText: string,
  recentMessages: GuardRecentMessage[],
  options: {
    isGuest?: boolean;
    roomId?: string;
    timeoutMs?: number;
  } = {}
): Promise<ResolveAiQuestionMusicRelatedResult> {
  const q = aiPromptText.trim();
  if (!q) return { outcome: 'allow' };
  if (isMusicRelatedAiQuestion(q)) return { outcome: 'allow' };

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch('/api/ai/question-guard-classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: q.slice(0, 2000),
        recentMessages: recentMessages.slice(-12).map((m) => ({
          displayName: m.displayName,
          body: m.body,
          messageType: m.messageType,
        })),
        isGuest: options.isGuest === true,
        roomId: options.roomId,
      }),
      signal: ctrl.signal,
    });

    const data = (await res.json().catch(() => null)) as {
      skipped?: boolean;
      musicRelated?: boolean | null;
      error?: string;
      message?: string;
    } | null;

    if (res.status === 429 && data?.error === 'rate_limit') {
      return {
        outcome: 'defer',
        message:
          typeof data.message === 'string' && data.message.trim()
            ? data.message
            : '質問の自動判定が混雑しています。少し待ってから再度「@」付きで送ってください。',
      };
    }

    if (!res.ok) {
      return {
        outcome: 'defer',
        message: '質問の分類に失敗しました。しばらくしてから再度お試しください。',
      };
    }

    if (data?.skipped === true || data?.musicRelated == null) {
      return { outcome: 'block' };
    }

    if (data.musicRelated === true) {
      return { outcome: 'allow' };
    }

    return { outcome: 'block' };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return {
        outcome: 'defer',
        message: '判定がタイムアウトしました。もう一度送ってください。',
      };
    }
    return {
      outcome: 'defer',
      message: '質問の分類に失敗しました。しばらくしてから再度お試しください。',
    };
  } finally {
    clearTimeout(tid);
  }
}
