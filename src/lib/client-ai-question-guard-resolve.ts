/**
 * ブラウザ用: 「@」質問の音楽関連判定（AI ファースト）。
 * ルールはガード無効・空文・選曲順の確認のみ。それ以外は Gemini 分類 API に委ねる。
 * API 未設定・失敗・タイムアウト時は fail-open（通す）。明示的 false のときだけ block。
 */

import { isAiTurnOrderClarificationText } from '@/lib/ai-turn-order-clarification';
import { isAiQuestionGuardDisabledClient } from '@/lib/chat-system-copy';

export type GuardRecentMessage = {
  displayName?: string;
  body: string;
  messageType: string;
};

export type ResolveAiQuestionMusicRelatedResult =
  | { outcome: 'allow' }
  | { outcome: 'block' }
  | { outcome: 'defer'; message: string };

const DEFAULT_TIMEOUT_MS = 6000;

export type QuestionGuardClassifyApiPayload = {
  skipped?: boolean;
  musicRelated?: boolean | null;
  error?: string;
  message?: string;
};

/**
 * 分類 API の HTTP 応答を outcome に変換（単体テスト用に export）。
 * fail-open: skipped / null / サーバー障害 / タイムアウト相当は allow。
 * block は Gemini が musicRelated:false を返したときのみ。
 */
export function resolveQuestionGuardClassifyApiOutcome(
  httpStatus: number,
  data: QuestionGuardClassifyApiPayload | null,
): ResolveAiQuestionMusicRelatedResult {
  if (httpStatus === 429 && data?.error === 'rate_limit') {
    return { outcome: 'allow' };
  }
  if (!httpStatus || httpStatus < 200 || httpStatus >= 300) {
    return { outcome: 'allow' };
  }
  if (data?.skipped === true || data?.musicRelated == null) {
    return { outcome: 'allow' };
  }
  if (data.musicRelated === true) {
    return { outcome: 'allow' };
  }
  return { outcome: 'block' };
}

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
  if (isAiQuestionGuardDisabledClient()) {
    return { outcome: 'allow' };
  }
  const q = aiPromptText.trim();
  if (!q) return { outcome: 'allow' };
  if (isAiTurnOrderClarificationText(q)) return { outcome: 'allow' };

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

    const data = (await res.json().catch(() => null)) as QuestionGuardClassifyApiPayload | null;
    return resolveQuestionGuardClassifyApiOutcome(res.status, data);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { outcome: 'allow' };
    }
    return { outcome: 'allow' };
  } finally {
    clearTimeout(tid);
  }
}
