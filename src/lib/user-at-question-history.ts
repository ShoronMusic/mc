import type { SupabaseClient } from '@supabase/supabase-js';
import { geminiUsageCategoryForContext } from '@/lib/gemini-usage-categories';
import { calcGeminiCostJpyApprox, calcGeminiCostUsd } from '@/lib/gemini-pricing';
import {
  buildAtChatPairsFromLogRows,
  isAtUserMessageBody,
  normalizeChatBodyForMatch,
  type RoomChatLogRow,
} from '@/lib/room-chat-at-qa-from-log';

const CONTEXT_BEFORE_MS = 60 * 1000;
const CONTEXT_AFTER_MS = 15 * 60 * 1000;
const MAX_USER_ROWS_SCAN = 300;
const MAX_ROOM_LOG_ROWS = 800;
const COST_WINDOW_BEFORE_MS = 30 * 1000;
const COST_WINDOW_AFTER_MS = 120 * 1000;

export type UserAtQuestionHistoryPair = {
  roomId: string;
  roomLabel: string | null;
  userBody: string;
  userCreatedAt: string;
  aiBody: string;
  aiCreatedAt: string;
  /** gemini_usage_logs から突合できたとき */
  costSource?: 'logged' | 'typical';
  costJpyApprox?: number;
  geminiCalls?: number;
};

type GeminiUsageLogLite = {
  created_at: string;
  room_id: string | null;
  context: string;
  prompt_token_count: number | null;
  output_token_count: number | null;
  model: string | null;
  billing_user_id: string | null;
  user_id: string | null;
};

function isMissingRoomChatLog(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? '';
  return error.code === '42P01' || /room_chat_log/i.test(message);
}

function isMissingGeminiUsageLogs(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? '';
  return error.code === '42P01' || /gemini_usage_logs/i.test(message);
}

function logBelongsToUser(log: GeminiUsageLogLite, userId: string): boolean {
  return log.billing_user_id === userId || log.user_id === userId;
}

function isAtQuestionGeminiContext(context: string): boolean {
  return geminiUsageCategoryForContext(context) === 'at_question';
}

function calcLogCostJpy(log: GeminiUsageLogLite): number {
  const model = (log.model || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
  const usd = calcGeminiCostUsd(log.prompt_token_count ?? 0, log.output_token_count ?? 0, model);
  return calcGeminiCostJpyApprox(usd);
}

/** gemini_usage_logs を質問時刻窓で突合し、1 Q&A あたりの原価試算を付与 */
export function attachAtQuestionCostEstimates(
  pairs: UserAtQuestionHistoryPair[],
  logs: readonly GeminiUsageLogLite[],
  userId: string,
): UserAtQuestionHistoryPair[] {
  const used = new Set<number>();

  return pairs.map((pair) => {
    const userMs = new Date(pair.userCreatedAt).getTime();
    const aiMs = new Date(pair.aiCreatedAt).getTime();
    if (Number.isNaN(userMs) || Number.isNaN(aiMs)) {
      return { ...pair, costSource: 'typical' as const };
    }

    const winStart = userMs - COST_WINDOW_BEFORE_MS;
    const winEnd = aiMs + COST_WINDOW_AFTER_MS;
    let sumJpy = 0;
    let calls = 0;

    logs.forEach((log, idx) => {
      if (used.has(idx)) return;
      if ((log.room_id ?? '').trim() !== pair.roomId) return;
      if (!logBelongsToUser(log, userId)) return;
      if (!isAtQuestionGeminiContext(log.context)) return;
      const t = new Date(log.created_at).getTime();
      if (Number.isNaN(t) || t < winStart || t > winEnd) return;
      used.add(idx);
      sumJpy += calcLogCostJpy(log);
      calls += 1;
    });

    if (calls > 0 && sumJpy > 0) {
      return {
        ...pair,
        costSource: 'logged',
        costJpyApprox: sumJpy,
        geminiCalls: calls,
      };
    }
    return { ...pair, costSource: 'typical' };
  });
}

export async function fetchGeminiLogsForAtQuestionPairs(
  admin: SupabaseClient,
  userId: string,
  pairs: readonly UserAtQuestionHistoryPair[],
): Promise<{ logs: GeminiUsageLogLite[]; missingTable: boolean }> {
  if (pairs.length === 0) return { logs: [], missingTable: false };

  const msList = pairs.flatMap((p) => [new Date(p.userCreatedAt).getTime(), new Date(p.aiCreatedAt).getTime()]);
  const valid = msList.filter((t) => !Number.isNaN(t));
  if (valid.length === 0) return { logs: [], missingTable: false };

  const minIso = new Date(Math.min(...valid) - COST_WINDOW_BEFORE_MS - 60_000).toISOString();
  const maxIso = new Date(Math.max(...valid) + COST_WINDOW_AFTER_MS + 60_000).toISOString();
  const roomIds = [...new Set(pairs.map((p) => p.roomId).filter(Boolean))];
  if (roomIds.length === 0) return { logs: [], missingTable: false };

  const { data, error } = await admin
    .from('gemini_usage_logs')
    .select(
      'created_at, room_id, context, prompt_token_count, output_token_count, model, billing_user_id, user_id',
    )
    .gte('created_at', minIso)
    .lte('created_at', maxIso)
    .in('room_id', roomIds)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) {
    if (isMissingGeminiUsageLogs(error)) return { logs: [], missingTable: true };
    throw error;
  }

  const logs = ((data ?? []) as GeminiUsageLogLite[]).filter(
    (log) => logBelongsToUser(log, userId) && isAtQuestionGeminiContext(log.context),
  );
  return { logs, missingTable: false };
}

function pairLookupKey(roomId: string, userCreatedAt: string, userBody: string): string {
  return `${roomId}|${userCreatedAt}|${normalizeChatBodyForMatch(userBody)}`;
}

/** ログインユーザー本人の @ 質問と直後の AI 回答（room_chat_log 由来） */
export async function fetchUserAtQuestionHistory(
  admin: SupabaseClient,
  userId: string,
  options?: { limit?: number; roomLabels?: Map<string, string> },
): Promise<{ pairs: UserAtQuestionHistoryPair[]; missingTable: boolean }> {
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
  const roomLabels = options?.roomLabels ?? new Map<string, string>();

  const { data: userRows, error } = await admin
    .from('room_chat_log')
    .select('room_id, created_at, body')
    .eq('user_id', userId)
    .eq('message_type', 'user')
    .order('created_at', { ascending: false })
    .limit(MAX_USER_ROWS_SCAN);

  if (error) {
    if (isMissingRoomChatLog(error)) return { pairs: [], missingTable: true };
    throw error;
  }

  const atRows = (userRows ?? []).filter((r) => isAtUserMessageBody(String(r.body ?? '')));
  if (atRows.length === 0) return { pairs: [], missingTable: false };

  const targetRows = atRows.slice(0, limit);
  const byRoom = new Map<string, Array<{ room_id: string; created_at: string; body: string }>>();
  for (const r of targetRows) {
    const roomId = String(r.room_id ?? '').trim();
    if (!roomId) continue;
    const list = byRoom.get(roomId) ?? [];
    list.push({ room_id: roomId, created_at: String(r.created_at), body: String(r.body) });
    byRoom.set(roomId, list);
  }

  const found = new Map<string, UserAtQuestionHistoryPair>();

  for (const [roomId, questions] of byRoom) {
    const times = questions
      .map((q) => new Date(q.created_at).getTime())
      .filter((t) => !Number.isNaN(t));
    if (times.length === 0) continue;

    const minIso = new Date(Math.min(...times) - CONTEXT_BEFORE_MS).toISOString();
    const maxIso = new Date(Math.max(...times) + CONTEXT_AFTER_MS).toISOString();

    const { data: roomLogs, error: roomErr } = await admin
      .from('room_chat_log')
      .select('created_at, message_type, display_name, body')
      .eq('room_id', roomId)
      .gte('created_at', minIso)
      .lte('created_at', maxIso)
      .order('created_at', { ascending: true })
      .limit(MAX_ROOM_LOG_ROWS);

    if (roomErr) {
      if (isMissingRoomChatLog(roomErr)) return { pairs: [], missingTable: true };
      throw roomErr;
    }

    const pairs = buildAtChatPairsFromLogRows((roomLogs ?? []) as RoomChatLogRow[]);
    const questionKeys = new Set(
      questions.map((q) => `${q.created_at}|${normalizeChatBodyForMatch(q.body)}`),
    );

    for (const p of pairs) {
      const qKey = `${p.userCreatedAt}|${normalizeChatBodyForMatch(p.userBody)}`;
      if (!questionKeys.has(qKey)) continue;
      const lookup = pairLookupKey(roomId, p.userCreatedAt, p.userBody);
      if (found.has(lookup)) continue;
      found.set(lookup, {
        roomId,
        roomLabel: roomLabels.get(roomId) ?? null,
        userBody: p.userBody,
        userCreatedAt: p.userCreatedAt,
        aiBody: p.aiBody,
        aiCreatedAt: p.aiCreatedAt,
      });
    }
  }

  const pairs = [...found.values()].sort((a, b) => b.userCreatedAt.localeCompare(a.userCreatedAt));
  return { pairs: pairs.slice(0, limit), missingTable: false };
}

/** 表示用: 先頭 @ と AI ラベルを除く */
export function formatAtQuestionBodyForDisplay(body: string): string {
  return body.trim().replace(/^[@＠]\s*/, '');
}

export function formatAtAnswerBodyForDisplay(body: string): string {
  return body.trim().replace(/^【AI回答】\s*/, '');
}
