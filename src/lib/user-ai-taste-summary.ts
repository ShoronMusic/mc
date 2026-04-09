/**
 * ログインユーザーがマイページに保存する「AI向け趣向メモ」。
 * 「@」チャット応答のプロンプトに短く注入する（サーバー専用）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const USER_AI_TASTE_SUMMARY_MAX_CHARS = 4000;
/** Gemini プロンプトに載せる上限（DB が長くても切り詰め） */
export const USER_AI_TASTE_PROMPT_MAX_CHARS = 1200;

export async function fetchUserAiTasteSummaryForChat(
  supabase: SupabaseClient,
  userId: string,
  options?: { maxChars?: number },
): Promise<string | null> {
  const cap = Math.min(
    Math.max(1, options?.maxChars ?? USER_AI_TASTE_PROMPT_MAX_CHARS),
    USER_AI_TASTE_SUMMARY_MAX_CHARS,
  );
  const { data, error } = await supabase
    .from('user_ai_taste_summary')
    .select('summary_text')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[user-ai-taste-summary] select', error.message);
    return null;
  }
  const t = typeof data?.summary_text === 'string' ? data.summary_text.trim() : '';
  if (!t) return null;
  return t.length > cap ? t.slice(0, cap) : t;
}
