import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { OAUTH_RETURN_COOKIE, safeOauthNextPath, clearOauthReturnCookieOn } from '@/lib/oauth-return-path';

/**
 * Supabase OAuth が Site URL 直下（例: /?code=）に戻すと /auth/callback を通らずセッションが確立しない。
 * ?code= 付きのパスを /auth/callback へ寄せて exchangeCodeForSession させる。
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();

  if (url.pathname.startsWith('/auth/callback') || url.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  if (!url.searchParams.has('code')) {
    return NextResponse.next();
  }

  const cb = new URL('/auth/callback', url.origin);
  url.searchParams.forEach((value, key) => {
    cb.searchParams.set(key, value);
  });

  const n = cb.searchParams.get('next');
  if (!n || !n.startsWith('/')) {
    let fallback = url.pathname === '/' ? '/' : url.pathname;
    if (fallback === '/') {
      const fromCookie = safeOauthNextPath(request.cookies.get(OAUTH_RETURN_COOKIE)?.value);
      if (fromCookie) fallback = fromCookie;
    }
    cb.searchParams.set('next', fallback);
  }

  const res = NextResponse.redirect(cb);
  clearOauthReturnCookieOn(res);
  return res;
}

export const config = {
  matcher: [
    // 単独の `/` は下のパターンにマッチしないことがあるため必ず含める（/?code= の救済）
    '/',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
