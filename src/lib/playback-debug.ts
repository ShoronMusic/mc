/**
 * 部屋の再生・同期まわりのデバッグログ。
 *
 * 有効化:
 * - 開発: 既定 ON（`localStorage.setItem('mc:playback:debug', '0')` で抑止）
 * - 本番: `localStorage.setItem('mc:playback:debug', '1')` → リロード
 *
 * ブラウザコンソールで `[mc-room-sync]` をフィルタすると、選曲者・キュー・曲解説・AIエージェント向けの
 * 構造化ログだけ追いやすい。
 */

const DEBUG_STORAGE_KEY = 'mc:playback:debug';

export function isPlaybackDebugEnabled(): boolean {
  return shouldLog();
}

function shouldLog(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = window.localStorage.getItem(DEBUG_STORAGE_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* noop */
  }
  return process.env.NODE_ENV === 'development';
}

function formatDebugTime(): string {
  return new Date().toISOString().slice(11, 23);
}

export function playbackLog(...args: unknown[]): void {
  if (!shouldLog()) return;
  // eslint-disable-next-line no-console
  console.log(`[mc-playback ${formatDebugTime()}]`, ...args);
}

/** 選曲者・キュー・曲解説・AIエージェントなど運用調査向けの構造化ログ */
export function roomSyncLog(event: string, detail?: Record<string, unknown>): void {
  if (!shouldLog()) return;
  // eslint-disable-next-line no-console
  console.log(`[mc-room-sync ${formatDebugTime()}] ${event}`, detail ?? {});
}
