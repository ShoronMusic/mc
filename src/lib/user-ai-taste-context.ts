/**
 * @ チャット向け: 手動趣向メモ + 自動趣向要約を1ブロックにまとげる。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  USER_AI_TASTE_PROMPT_MAX_CHARS,
  USER_AI_TASTE_SUMMARY_MAX_CHARS,
  fetchUserAiTasteSummaryForChat,
} from '@/lib/user-ai-taste-summary';
import {
  USER_AI_TASTE_AUTO_IN_COMBINED_MAX_CHARS,
  fetchUserAiTasteAutoProfileForChat,
} from '@/lib/user-ai-taste-auto-profile';

const AUTO_SECTION_LABEL =
  '\n\n【自動要約（履歴・マイリスト等から生成。参考程度）】\n';

/** 単体テスト用: 手動・自動を合算し Gemini 用に最大長へ収める */
export function mergeManualAndAutoTasteForPrompt(
  manual: string | null,
  auto: string | null,
): string | null {
  const m = (manual ?? '').trim();
  const a = (auto ?? '').trim();
  if (!m && !a) return null;
  const max = USER_AI_TASTE_PROMPT_MAX_CHARS;
  if (!a) return m.length > max ? m.slice(0, max) : m;
  if (!m) return a.length > max ? a.slice(0, max) : a;

  const autoCap = Math.min(USER_AI_TASTE_AUTO_IN_COMBINED_MAX_CHARS, max - AUTO_SECTION_LABEL.length);
  let aPart = a.length <= autoCap ? a : `${a.slice(0, Math.max(0, autoCap - 1))}…`;
  const roomForManual = max - AUTO_SECTION_LABEL.length - aPart.length;
  let mPart = m.length <= roomForManual ? m : `${m.slice(0, Math.max(0, roomForManual - 1))}…`;
  return `${mPart}${AUTO_SECTION_LABEL}${aPart}`;
}

/**
 * Gemini の趣向ブロック用。DB の手動メモは十分な長さまで読み、出力は {@link USER_AI_TASTE_PROMPT_MAX_CHARS} 以内に収める。
 */
export async function fetchUserTasteContextForChat(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const [manual, auto] = await Promise.all([
    fetchUserAiTasteSummaryForChat(supabase, userId, {
      maxChars: USER_AI_TASTE_SUMMARY_MAX_CHARS,
    }),
    fetchUserAiTasteAutoProfileForChat(supabase, userId),
  ]);
  return mergeManualAndAutoTasteForPrompt(manual, auto);
}
