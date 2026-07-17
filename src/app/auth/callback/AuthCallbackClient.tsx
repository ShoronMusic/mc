'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import {
  clearOAuthReturnPathCookie,
  readOAuthReturnPathCookie,
  safeOauthNextPath,
} from '@/lib/oauth-return-path';
import { safeAuthNextPath } from '@/lib/supabase-email-auth';
import { createClient } from '@/lib/supabase/client';

function resolveOAuthNext(raw: string | null): string {
  const fromQuery = safeOauthNextPath(raw);
  if (fromQuery) return fromQuery;
  const fromCookie = readOAuthReturnPathCookie();
  if (fromCookie) return fromCookie;
  return '/';
}

function resolveForcedNext(forced: string): string {
  const t = forced.trim();
  if (!t.startsWith('/') || t.startsWith('//')) return '/';
  return t;
}

export interface AuthCallbackClientProps {
  /**
   * パスワード再設定メール用。Supabase が redirectTo のクエリ（next）を落とすことがあるため、
   * この URL では常にここへ遷移する（OAuth 等の汎用 /auth/callback とは分ける）。
   */
  forcedNext?: string | null;
}

function appendAuthNotice(path: string, notice: string): string {
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('auth_notice', notice);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function AuthCallbackClient({ forcedNext }: AuthCallbackClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const run = async () => {
      const oauthError = searchParams.get('error');
      const errorDescription = searchParams.get('error_description') ?? '';
      const next =
        forcedNext != null && forcedNext !== ''
          ? resolveForcedNext(forcedNext)
          : resolveOAuthNext(searchParams.get('next'));
      const flow = searchParams.get('flow');
      const destination =
        flow === 'email_confirm' ? appendAuthNotice(safeAuthNextPath(next), 'email_confirmed') : next;

      clearOAuthReturnPathCookie();

      if (oauthError) {
        const isStateExpired = oauthError === 'invalid_request' && errorDescription.includes('expired');
        const message = isStateExpired
          ? 'state_expired'
          : encodeURIComponent(errorDescription || oauthError);
        router.replace(`/?auth_error=${message}`);
        return;
      }

      const code = searchParams.get('code');
      const supabase = createClient();
      if (!supabase) {
        router.replace(`/?auth_error=${encodeURIComponent('Supabase が未設定です。')}`);
        return;
      }

      if (!code) {
        router.replace(destination);
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          router.replace(destination);
          return;
        }
        router.replace(`/?auth_error=${encodeURIComponent(error.message)}`);
        return;
      }

      router.replace(destination);
    };

    void run();
  }, [router, searchParams, forcedNext]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-4 text-gray-300">
      <p>認証を処理しています…</p>
    </div>
  );
}
