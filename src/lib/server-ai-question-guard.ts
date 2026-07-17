/**
 * /api/ai/chat サーバ側の音楽関連質問ガード。
 * クライアントガードを迂回した直 POST を防ぐ。
 * 障害時は既定で fail-closed。運用で通したいときだけ
 * `AI_QUESTION_GUARD_SERVER_FAIL_OPEN=1`。
 */

import { isAiTurnOrderClarificationText } from '@/lib/ai-turn-order-clarification';
import { isAiQuestionGuardDisabledClient } from '@/lib/chat-system-copy';
import { classifyMusicRelatedAiQuestionGemini } from '@/lib/gemini-question-guard-classify';
import { isAiUnlimitedUserId } from '@/lib/ai-unlimited-user-ids';

export type ServerQuestionGuardResult =
  | { ok: true }
  | { ok: false; status: number; body: { error: string; message: string } };

function stripAtPrompt(text: string): string {
  return text.trim().replace(/^@\s*/, '').trim();
}

export function isAiQuestionGuardServerFailOpen(): boolean {
  return process.env.AI_QUESTION_GUARD_SERVER_FAIL_OPEN === '1';
}

export async function enforceServerAiQuestionGuard(params: {
  userText: string;
  recentMessages: { displayName?: string; body?: string; messageType?: string }[];
  roomId?: string;
  userId?: string | null;
  isGuest?: boolean;
}): Promise<ServerQuestionGuardResult> {
  if (isAiQuestionGuardDisabledClient()) return { ok: true };
  if (params.userId && isAiUnlimitedUserId(params.userId)) return { ok: true };

  const q = stripAtPrompt(params.userText);
  if (!q) return { ok: true };
  if (isAiTurnOrderClarificationText(q)) return { ok: true };

  const musicRelated = await classifyMusicRelatedAiQuestionGemini(
    q.slice(0, 2000),
    params.recentMessages.slice(-12),
    {
      roomId: params.roomId ?? null,
      userId: params.userId ?? null,
      isGuest: params.isGuest === true,
    },
  );

  if (musicRelated === true) return { ok: true };
  if (musicRelated === false) {
    return {
      ok: false,
      status: 403,
      body: {
        error: 'not_music_related',
        message:
          '音楽・洋楽に関係しない質問のため、AI は回答できません。曲・アーティスト・選曲まわりで聞き直してください。',
      },
    };
  }

  if (isAiQuestionGuardServerFailOpen()) return { ok: true };

  return {
    ok: false,
    status: 503,
    body: {
      error: 'question_guard_unavailable',
      message:
        '質問の自動判定が一時的に利用できません。しばらくしてから再度お試しください。',
    },
  };
}
