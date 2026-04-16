'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

function safeNext(raw: string | null): string {
  let n = raw ?? '/';
  if (!n.startsWith('/')) n = '/';
  return n;
}

export interface AuthCallbackClientProps {
  /**
   * パスワード再設定メール用。Supabase が redirectTo のクエリ（next）を落とすことがあるため、
   * この URL では常にここへ遷移する（OAuth 等の汎用 /auth/callback とは分ける）。
   */
  forcedNext?: string | null;
}

export function AuthCallbackClient({ forcedNext }: AuthCallbackClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const run = async () => {
      const oauthError = searchParams.get('error');
      const errorDescription = searchParams.get('error_description') ?? '';
      const queryNext = safeNext(searchParams.get('next'));
      const next = forcedNext != null && forcedNext !== '' ? safeNext(forcedNext) : queryNext;

      try {
        document.cookie = 'mc_oauth_next=; Path=/; Max-Age=0';
      } catch {
        /* ignore */
      }

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
        router.replace(next);
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          router.replace(next);
          return;
        }
        router.replace(`/?auth_error=${encodeURIComponent(error.message)}`);
        return;
      }

      router.replace(next);
    };

    void run();
  }, [router, searchParams, forcedNext]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-4 text-gray-300">
      <p>認証を処理しています…</p>
    </div>
  );
}
