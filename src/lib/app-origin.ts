/**
 * OAuth の redirectTo に使うオリジン。
 * 開発時のみ NEXT_PUBLIC_APP_ORIGIN（localhost 固定）を使い、本番では常に window.location.origin。
 * 本番ビルドに localhost が焼き込まれると Google 後に localhost へ飛ぼうとして失敗し、?code= が Vercel に残る。
 */
export function getBrowserAppOrigin(): string {
  if (typeof window === 'undefined') return '';
  const fixed = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim();
  if (fixed && process.env.NODE_ENV === 'development') {
    try {
      return new URL(fixed).origin;
    } catch {
      /* 無効なら window にフォールバック */
    }
  }
  return window.location.origin;
}
