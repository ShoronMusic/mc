'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const MESSAGE_MAP: Record<string, string> = {
  state_expired:
    'Google認証の有効期限が切れました。時間がかかった場合に起こります。もう一度ルームを選び、Google認証で参加を押し直してください。',
};

const PKCE_HINT =
  'Google 認証は「ボタンを押したページと同じドメイン」で戻る必要があります。いまのアドレスが本番（Vercel）なら、localhost で開き直してからやり直してください。ローカルで試すなら、Supabase の Authentication → URL Configuration の Redirect URLs に、そのときのアドレスに合わせた「…/auth/callback」（例: http://localhost:3002/auth/callback）を必ず追加してください。';

const RECOVERY_LINK_HINT =
  'パスワード再設定のリンクが無効か、期限切れです。次を試してください。（1）ルーム参加画面の「パスワードをお忘れですか？」から、新しい再設定メールを送る。（2）再設定メールを送ったのと同じ端末・同じブラウザで、メール内のリンクを開く（別アプリのブラウザやスマホだけだと失敗することがあります）。（3）職場メールの「安全なリンク」先読みでリンクが一度使われている場合があります。時間をおいて再送するか、別の受信箱で試してください。';

function isPkceVerifierError(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes('pkce') && t.includes('verifier');
}

function isRecoveryLinkError(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes('email link is invalid') ||
    t.includes('invalid or has expired') ||
    t.includes('otp expired') ||
    t.includes('token has expired')
  );
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
      const decoded =
        authError === 'state_expired' || authError.startsWith('state_expired')
          ? authError
          : (() => {
              try {
                return decodeURIComponent(authError);
              } catch {
                return authError;
              }
            })();
      text =
        MESSAGE_MAP[authError] ||
        (authError.startsWith('state_expired') ? MESSAGE_MAP.state_expired : null) ||
        (isRecoveryLinkError(decoded) ? RECOVERY_LINK_HINT : null) ||
        (isPkceVerifierError(decoded)
          ? `${PKCE_HINT}（技術詳細: ${decoded}）`
          : `認証でエラーが発生しました。もう一度お試しください。（${decoded}）`);
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
