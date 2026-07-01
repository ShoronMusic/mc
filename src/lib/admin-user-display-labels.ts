/**
 * 管理画面向け: user_id → 表示名（参加履歴の最新 display_name）
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export function shortUserIdLabel(userId: string): string {
  const t = userId.trim();
  if (t.length <= 10) return t;
  return `${t.slice(0, 8)}…`;
}

/** 参加履歴から user_id ごとの最新 display_name を取得 */
export async function resolveAdminUserDisplayLabels(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
  const out = new Map<string, string>();
  if (ids.length === 0) return out;

  const { data, error } = await admin
    .from('user_room_participation_history')
    .select('user_id, display_name, joined_at')
    .in('user_id', ids)
    .order('joined_at', { ascending: false })
    .limit(Math.min(ids.length * 5, 500));

  if (error && error.code !== '42P01') {
    console.error('[admin-user-display-labels]', error.message);
  }

  for (const row of data ?? []) {
    const uid = typeof row.user_id === 'string' ? row.user_id.trim() : '';
    if (!uid || out.has(uid)) continue;
    const name = typeof row.display_name === 'string' ? row.display_name.trim() : '';
    out.set(uid, name || shortUserIdLabel(uid));
  }

  for (const uid of ids) {
    if (!out.has(uid)) out.set(uid, shortUserIdLabel(uid));
  }
  return out;
}
