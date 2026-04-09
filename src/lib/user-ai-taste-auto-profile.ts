/**
 * 会話・マイリスト等から自動生成した趣向要約（1ユーザー1行）。
 * マイページの手動メモ（user_ai_taste_summary）と併せて @ チャットに注入する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const USER_AI_TASTE_AUTO_PROFILE_MAX_CHARS = 800;
/** 手動メモと合算時の自動側の上限（user-ai-taste-context で使用） */
export const USER_AI_TASTE_AUTO_IN_COMBINED_MAX_CHARS = 450;

export async function fetchUserAiTasteAutoProfileForChat(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_ai_taste_auto_profile')
    .select('profile_text')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01') return null;
    console.warn('[user-ai-taste-auto-profile] select', error.message);
    return null;
  }
  const t = typeof data?.profile_text === 'string' ? data.profile_text.trim() : '';
  if (!t) return null;
  return t.length > USER_AI_TASTE_AUTO_PROFILE_MAX_CHARS
    ? t.slice(0, USER_AI_TASTE_AUTO_PROFILE_MAX_CHARS)
    : t;
}
