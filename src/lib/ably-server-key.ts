/**
 * サーバ専用 Ably API キー。ブラウザに出さない。
 * `ABLY_API_KEY` のみ（`NEXT_PUBLIC_ABLY_API_KEY` フォールバックなし）。
 */

export function getAblyServerApiKey(): string {
  return process.env.ABLY_API_KEY?.trim() ?? '';
}

export function isAblyServerConfigured(): boolean {
  return getAblyServerApiKey().length > 0;
}
