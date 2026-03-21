import type { NextResponse } from 'next/server';

/**
 * Supabase が Site URL 直下（/?code=）に戻すと URL に next が無くルーム等の戻り先が失われる。
 * OAuth 直前にクッキーへ保存し、ミドルウェア / クライアント救済で /auth/callback の next に載せる。
 */
export const OAUTH_RETURN_COOKIE = 'mc_oauth_next';

/** オープンリダイレクト防止: `/` または `/01` 形式のみ */
export function safeOauthNextPath(raw: string | undefined | null): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  let s = raw.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    return null;
  }
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  if (s === '/') return '/';
  if (/^\/[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(s)) return s;
  return null;
}

/** クライアントのみ。Google OAuth の直前に呼ぶ */
export function setOAuthReturnPathCookie(pathname: string): void {
  if (typeof document === 'undefined') return;
  const safe = safeOauthNextPath(pathname);
  if (!safe) return;
  try {
    document.cookie = `${OAUTH_RETURN_COOKIE}=${encodeURIComponent(safe)}; Path=/; Max-Age=600; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function clearOauthReturnCookieOn(response: NextResponse): void {
  response.cookies.set(OAUTH_RETURN_COOKIE, '', { path: '/', maxAge: 0 });
}
