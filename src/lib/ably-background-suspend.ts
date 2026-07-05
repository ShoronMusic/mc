/** 裏タブ切断の純粋ロジック（単体テスト用） */

export function isDocumentHiddenState(state: DocumentVisibilityState | string): boolean {
  return state === 'hidden';
}

/** hidden 開始から thresholdMs 経過で切断対象 */
export function shouldSuspendAblyForHidden(
  hiddenStartedAtMs: number | null,
  nowMs: number,
  thresholdMs: number,
): boolean {
  if (hiddenStartedAtMs == null || !Number.isFinite(hiddenStartedAtMs)) return false;
  if (!Number.isFinite(nowMs) || !Number.isFinite(thresholdMs) || thresholdMs <= 0) return false;
  return nowMs - hiddenStartedAtMs >= thresholdMs;
}
