import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { clearOauthReturnCookieOn } from '@/lib/oauth-return-path';

export const dynamic = 'force-dynamic';

/**
 * OAuth 戻り。Route Handler では cookieStore.set だけだとリダイレクト応答にセッションが載らないことがあるため、
 * NextResponse を先に作り exchangeCodeForSession の setAll で response.cookies に載せる。
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description') ?? '';
  let next = url.searchParams.get('next') ?? '/';
  if (!next.startsWith('/')) next = '/';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

  if (oauthError) {
    const isStateExpired = oauthError === 'invalid_request' && errorDescription.includes('expired');
    const message = isStateExpired
      ? 'state_expired'
      : encodeURIComponent(errorDescription || oauthError);
    const redirectUrl = new URL('/', url.origin);
    redirectUrl.searchParams.set('auth_error', message);
    const errRes = NextResponse.redirect(redirectUrl);
    clearOauthReturnCookieOn(errRes);
    return errRes;
  }

  const redirectTarget = new URL(next, url.origin);

  const isLocalHttp =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]';

  if (code && supabaseUrl && supabaseKey) {
    const response = NextResponse.redirect(redirectTarget);
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // http://localhost では Secure クッキーが保存されずセッションが載らないブラウザがある
            response.cookies.set(name, value, {
              ...options,
              ...(isLocalHttp ? { secure: false } : {}),
            });
          });
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const fail = new URL('/', url.origin);
      fail.searchParams.set('auth_error', encodeURIComponent(error.message));
      const failRes = NextResponse.redirect(fail);
      clearOauthReturnCookieOn(failRes);
      return failRes;
    }
    clearOauthReturnCookieOn(response);
    return response;
  }

  const done = NextResponse.redirect(redirectTarget);
  clearOauthReturnCookieOn(done);
  return done;
}
