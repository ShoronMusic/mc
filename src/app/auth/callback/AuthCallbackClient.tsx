'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

function safeNext(raw: string | null): string {
  let n = raw ?? '/';
  if (!n.startsWith('/')) n = '/';
  return n;
}

export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const run = async () => {
      const oauthError = searchParams.get('error');
      const errorDescription = searchParams.get('error_description') ?? '';
      const next = safeNext(searchParams.get('next'));

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
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          router.replace(next);
          return;
        }
        router.replace(`/?auth_error=${encodeURIComponent(error.message)}`);
        return;
      }

      router.replace(next);
    };

    void run();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-4 text-gray-300">
      <p>認証を処理しています…</p>
    </div>
  );
}
