import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** middleware 内 getUser の待ち上限（超えたら fail-open で 504 を避ける） */
export function getMiddlewareSupabaseAuthTimeoutMs(): number {
  const n = parsePositiveInt(process.env.MIDDLEWARE_SUPABASE_AUTH_TIMEOUT_MS, 4_000);
  return Math.min(15_000, Math.max(1_000, n));
}

/** 未ログイン等で Supabase へ行く必要がないとき true */
export function shouldSkipSupabaseMiddlewareAuthRefresh(request: NextRequest): boolean {
  return !request.cookies.getAll().some((c) => c.name.includes('-auth-token'));
}

/**
 * リクエストごとに Supabase セッション cookie を更新（PWA 冷起動・共有復帰で期限切れに見えるのを防ぐ）。
 * Supabase が遅い・落ちているときは fail-open（ページは表示、cookie 更新のみスキップ）。
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  if (!url || !key) return response;
  if (shouldSkipSupabaseMiddlewareAuthRefresh(request)) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const timeoutMs = getMiddlewareSupabaseAuthTimeoutMs();
  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('middleware_auth_timeout')), timeoutMs);
      }),
    ]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[middleware] supabase auth refresh skipped:', err);
  }

  return response;
}
