/**
 * チャットの送信制限（嫌がらせ・ボット対策）
 * - 1件あたりの文字数上限
 * - 送信間隔の最小秒数
 * - 1分あたりの送信回数上限
 */

/** 1メッセージの最大文字数 */
export const MAX_MESSAGE_LENGTH = 500;

/** 連続送信の最小間隔（ミリ秒） */
export const MIN_SEND_INTERVAL_MS = 3000;

/** 1分あたりの最大送信回数 */
export const MAX_SENDS_PER_MINUTE = 15;

export type SendLimitResult =
  | { ok: true }
  | { ok: false; reason: 'length' | 'interval' | 'rate' };

/** 制限に引っかかったときのユーザー向けメッセージ */
export function getSendLimitMessage(reason: 'length' | 'interval' | 'rate'): string {
  switch (reason) {
    case 'length':
      return `メッセージは${MAX_MESSAGE_LENGTH}文字以内で送信してください。`;
    case 'interval':
      return `送信が早すぎます。${MIN_SEND_INTERVAL_MS / 1000}秒以上あけてから送信してください。`;
    case 'rate':
      return `送信回数が多すぎます。1分あたり${MAX_SENDS_PER_MINUTE}回までです。しばらく待ってから送信してください。`;
    default:
      return '送信できません。しばらく待ってからお試しください。';
  }
}

/**
 * 送信可能かチェックする。
 * 制限用の ref は呼び出し側で保持し、送信成功時に updateSendTimestamps を呼ぶこと。
 */
export function checkSendLimit(
  text: string,
  lastSendAtRef: { current: number },
  sendTimestampsRef: { current: number[] }
): SendLimitResult {
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, reason: 'length' };
  }
  const now = Date.now();
  if (now - lastSendAtRef.current < MIN_SEND_INTERVAL_MS) {
    return { ok: false, reason: 'interval' };
  }
  const oneMinuteAgo = now - 60 * 1000;
  const recent = sendTimestampsRef.current.filter((t) => t > oneMinuteAgo);
  if (recent.length >= MAX_SENDS_PER_MINUTE) {
    return { ok: false, reason: 'rate' };
  }
  return { ok: true };
}

/**
 * 送信成功時に呼び、次回の制限チェック用に時刻を記録する。
 */
export function updateSendTimestamps(
  lastSendAtRef: { current: number },
  sendTimestampsRef: { current: number[] }
): void {
  const now = Date.now();
  lastSendAtRef.current = now;
  const oneMinuteAgo = now - 60 * 1000;
  sendTimestampsRef.current = [
    ...sendTimestampsRef.current.filter((t) => t > oneMinuteAgo),
    now,
  ];
}
