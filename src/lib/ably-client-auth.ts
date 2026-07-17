/**
 * クライアントが Ably Token Auth を使うかどうか（公開キーは持たない）。
 * `NEXT_PUBLIC_ABLY_ENABLED=1` のとき Token Auth 経路を有効化。
 */

export function isAblyClientAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ABLY_ENABLED === '1';
}
