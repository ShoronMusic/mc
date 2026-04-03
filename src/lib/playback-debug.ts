/**
 * 部屋の再生まわりのデバッグログ。
 * - 開発時: 既定で ON（`localStorage mc:playback:debug=0` で抑止）
 * - 本番: `localStorage mc:playback:debug=1` のときのみ ON
 */

function shouldLog(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = window.localStorage.getItem('mc:playback:debug');
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* noop */
  }
  return process.env.NODE_ENV === 'development';
}

export function playbackLog(...args: unknown[]): void {
  if (!shouldLog()) return;
  const t = new Date().toISOString().slice(11, 23);
  // eslint-disable-next-line no-console
  console.log(`[mc-playback ${t}]`, ...args);
}
