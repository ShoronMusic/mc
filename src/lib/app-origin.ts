/**
 * Google OAuth の redirectTo に使うオリジン。
 * 常に window.location.origin のみを使う（PKCE の code verifier はこのオリジンのクッキーに保存される）。
 *
 * NEXT_PUBLIC_APP_ORIGIN で別ホストに寄せると、localhost で押したのに redirect だけ本番になるなどのずれで
 * 「PKCE code verifier not found」が必ず起きるため、OAuth では参照しない。
 */
export function getBrowserAppOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}
