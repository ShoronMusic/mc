/** Ably 通信削減・裏タブ切断の設定（NEXT_PUBLIC_* で上書き可） */

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** オーナー設定 heartbeat 間隔（既定 60 秒） */
export function getAblyOwnerSettingsHeartbeatMs(): number {
  const raw = process.env.NEXT_PUBLIC_ABLY_OWNER_HEARTBEAT_MS;
  const n = parsePositiveInt(raw, 60_000);
  return clamp(n, 15_000, 300_000);
}

/** 裏タブ切断までの待ち時間（既定 30 分） */
export function getAblyBackgroundSuspendMs(): number {
  const raw = process.env.NEXT_PUBLIC_ABLY_BACKGROUND_SUSPEND_MS;
  const n = parsePositiveInt(raw, 30 * 60_000);
  return clamp(n, 60_000, 2 * 60 * 60_000);
}

/** 裏タブ切断を無効化 */
export function isAblyBackgroundSuspendDisabled(): boolean {
  return process.env.NEXT_PUBLIC_ABLY_BACKGROUND_SUSPEND_DISABLED === '1';
}

/** 裏タブ中（切断前）も定期 publish / presence 更新を止める（既定 ON） */
export function isAblyReduceTrafficWhenHidden(): boolean {
  if (process.env.NEXT_PUBLIC_ABLY_REDUCE_WHEN_HIDDEN === '0') return false;
  return true;
}
