import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  OAUTH_RETURN_COOKIE,
  safeOauthNextPath,
  clearOauthReturnCookieOn,
  hasOAuthAuthorizationQuery,
} from '@/lib/oauth-return-path';
import { updateSupabaseSession } from '@/lib/supabase/middleware';

/**
 * Supabase OAuth が Site URL 直下（例: /?code=）に戻すと /auth/callback を通らずセッションが確立しない。
 * ?code= 付きのパスを /auth/callback へ寄せて exchangeCodeForSession させる。
 * それ以外は Supabase セッション cookie を更新（PWA 共有復帰向け）。
 */
export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();

  if (url.pathname.startsWith('/auth/callback') || url.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  if (hasOAuthAuthorizationQuery(url.searchParams, url.pathname)) {
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

  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    '/',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
