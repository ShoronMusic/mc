/**
 * 会話・マイリスト等から自動生成した趣向要約（1ユーザー1行）。
 * マイページの手動メモ（user_ai_taste_summary）と併せて @ チャットに注入する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const USER_AI_TASTE_AUTO_PROFILE_MAX_CHARS = 800;
/** 手動メモと合算時の自動側の上限（user-ai-taste-context で使用） */
export const USER_AI_TASTE_AUTO_IN_COMBINED_MAX_CHARS = 450;

/** モデル出力が途中で切れている（「90年代の」で終わる等） */
export function looksTruncatedUserTasteAutoProfile(text: string): boolean {
  const t = text.replace(/\r\n/g, '\n').trim();
  if (!t) return true;
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? '';
  if (/[。．!?？…]$/.test(last)) return false;
  if (/[のはがをにでとや、]$/.test(last)) return true;
  if (lines.length === 1 && last.length < 120) return true;
  return false;
}

/** 自動要約が実質的な趣向情報を含むか（導入文だけ等は false） */
export function isSubstantiveUserTasteAutoProfile(text: string): boolean {
  const t = text.replace(/\r\n/g, '\n').trim();
  if (!t) return false;
  if (looksTruncatedUserTasteAutoProfile(t)) return false;

  // 「…以下の通りです。」だけで中身が無い（Gemini が前置きのみ返した典型）
  if (
    /(以下の通り|次のとおり)/u.test(t) &&
    !/(?:^|\n)\s*[-*]\s+\S/.test(t) &&
    !/(?:^|\n)\s*・[ぁ-んァ-ヶ一-龥A-Za-z0-9]/.test(t) &&
    !/^\d+[.)．]\s*\S/m.test(t)
  ) {
    const afterIntro = t
      .replace(/^[\s\S]*?(以下の通り|次のとおり)[^。\n]*[。.]?\s*/u, '')
      .trim();
    if (!afterIntro || afterIntro.length < 12) return false;
  }

  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) return true;

  const hasLineBullet =
    /(?:^|\n)\s*[-*]\s+\S/.test(t) ||
    /(?:^|\n)\s*・[ぁ-んァ-ヶ一-龥A-Za-z0-9]/.test(t) ||
    /^\d+[.)．]\s*\S/m.test(t);
  if (hasLineBullet) return t.length >= 20;

  return t.length >= 48;
}

/** チャット・プレビュー用。薄い自動要約は null */
export function userTasteAutoProfileForUse(text: string | null | undefined): string | null {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t || !isSubstantiveUserTasteAutoProfile(t)) return null;
  return t.length > USER_AI_TASTE_AUTO_PROFILE_MAX_CHARS
    ? t.slice(0, USER_AI_TASTE_AUTO_PROFILE_MAX_CHARS)
    : t;
}

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
  const t = typeof data?.profile_text === 'string' ? data.profile_text : '';
  return userTasteAutoProfileForUse(t);
}
