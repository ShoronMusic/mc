'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const MESSAGE_MAP: Record<string, string> = {
  state_expired:
    'Google認証の有効期限が切れました。時間がかかった場合に起こります。もう一度ルームを選び、Google認証で参加を押し直してください。',
};

const PKCE_HINT =
  'Google 認証は「ボタンを押したページと同じドメイン」で戻る必要があります。いまのアドレスが本番（Vercel）なら、localhost で開き直してからやり直してください。ローカルで試すなら、Supabase の Authentication → URL Configuration の Redirect URLs に、そのときのアドレスに合わせた「…/auth/callback」（例: http://localhost:3002/auth/callback）を必ず追加してください。';

function isPkceVerifierError(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes('pkce') && t.includes('verifier');
}

export function AuthErrorBanner() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const authError = searchParams.get('auth_error');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description') ?? '';
    const errorCode = searchParams.get('error_code') ?? '';

    let text: string | null = null;
    if (authError) {
      text =
        MESSAGE_MAP[authError] ||
        (authError.startsWith('state_expired') ? MESSAGE_MAP.state_expired : null) ||
        (isPkceVerifierError(authError)
          ? `${PKCE_HINT}（技術詳細: ${authError}）`
          : `認証でエラーが発生しました。もう一度お試しください。（${authError}）`);
    } else if (error === 'invalid_request' && (errorCode === 'bad_oauth_state' || errorDescription.includes('expired'))) {
      text = MESSAGE_MAP.state_expired;
    } else if (error) {
      text = errorDescription || `認証でエラーが発生しました。（${error}）`;
    }
    if (!text) return;
    setMessage(text);
    try {
      window.history.replaceState({}, '', window.location.pathname);
    } catch {}
  }, [searchParams]);

  if (!message) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-700 bg-amber-900/40 px-4 py-3 text-sm text-amber-200">
      <p>{message}</p>
    </div>
  );
}
