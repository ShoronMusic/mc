/**
 * トップ・同意ページの「開催中」一覧から除外する roomId（`NEXT_PUBLIC_HOME_EXCLUDED_LIVE_ROOM_IDS`）。
 */
export const HOME_EXCLUDED_LIVE_ROOM_IDS: ReadonlySet<string> = new Set(
  (() => {
    const raw = process.env.NEXT_PUBLIC_HOME_EXCLUDED_LIVE_ROOM_IDS;
    if (raw === undefined) return ['02'];
    const t = raw.trim();
    if (t === '') return [];
    return t.split(',').map((s) => s.trim()).filter(Boolean);
  })(),
);
