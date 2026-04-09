/**
 * ログインユーザーの参加履歴から入室挨拶バリアントを決める（クライアント／サーバー共通）。
 */

export type JoinGreetingRow = {
  joined_at: string;
  left_at: string | null;
  room_id: string;
};

export type JoinGreetingVariant =
  | { kind: 'first_time' }
  | { kind: 'frequent' }
  | { kind: 'absent'; days: number }
  | { kind: 'none' };

/** 直近この日数以内の入室回数で「いつも参加」判定 */
export const JOIN_GREETING_FREQUENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** この回数以上で frequent */
export const JOIN_GREETING_FREQUENT_MIN_JOINS = 6;
/** この日数以上空いたら「日ぶり」 */
export const JOIN_GREETING_ABSENT_MIN_DAYS = 2;

export function computeJoinGreetingVariant(rows: JoinGreetingRow[]): JoinGreetingVariant {
  if (!rows.length) return { kind: 'none' };

  // 生涯1件だけ＝初参加セッション中（この入室で insert 済みの1行）
  if (rows.length === 1) return { kind: 'first_time' };

  const now = Date.now();
  const windowStart = now - JOIN_GREETING_FREQUENT_WINDOW_MS;
  const recentJoins = rows.filter((r) => {
    const t = Date.parse(r.joined_at);
    return Number.isFinite(t) && t >= windowStart;
  }).length;
  if (recentJoins >= JOIN_GREETING_FREQUENT_MIN_JOINS) return { kind: 'frequent' };

  const ended = rows.filter((r) => r.left_at != null && String(r.left_at).trim() !== '');
  if (!ended.length) return { kind: 'none' };

  let lastEndMs = 0;
  for (const r of ended) {
    const t = Date.parse(r.left_at as string);
    if (Number.isFinite(t) && t > lastEndMs) lastEndMs = t;
  }
  if (!lastEndMs) return { kind: 'none' };

  const days = Math.floor((now - lastEndMs) / (24 * 60 * 60 * 1000));
  if (days >= JOIN_GREETING_ABSENT_MIN_DAYS) return { kind: 'absent', days };
  return { kind: 'none' };
}

/** API・UI 用のフラット形 */
export function joinGreetingVariantToResponse(v: JoinGreetingVariant): {
  variant: 'first_time' | 'frequent' | 'absent' | 'none';
  daysSinceLastVisit: number | null;
} {
  if (v.kind === 'absent') {
    return { variant: 'absent', daysSinceLastVisit: v.days };
  }
  if (v.kind === 'first_time') return { variant: 'first_time', daysSinceLastVisit: null };
  if (v.kind === 'frequent') return { variant: 'frequent', daysSinceLastVisit: null };
  return { variant: 'none', daysSinceLastVisit: null };
}

/** API の JSON を1行挨拶に変換。該当なしは null（呼び出し側が時間帯挨拶のまま） */
export function lineFromJoinGreetingApi(
  displayName: string,
  timeGreeting: string,
  api: { variant?: string; daysSinceLastVisit?: number | null } | null,
): string | null {
  if (!api || typeof api.variant !== 'string' || api.variant === 'none') return null;
  const name = displayName.trim() || 'ゲスト';
  if (api.variant === 'first_time') {
    return `${name}さん、はじめまして！${timeGreeting}。今日もよろしくお願いします。`;
  }
  if (api.variant === 'frequent') {
    return `${name}さん、いつもご参加ありがとうございます。今日もよろしくお願いします。`;
  }
  if (
    api.variant === 'absent' &&
    typeof api.daysSinceLastVisit === 'number' &&
    api.daysSinceLastVisit >= JOIN_GREETING_ABSENT_MIN_DAYS
  ) {
    return `${name}さん、${api.daysSinceLastVisit}日ぶりですね！今日もよろしくお願いします。`;
  }
  return null;
}
