'use client';

import { useEffect, useState } from 'react';
import { EnvelopeIcon } from '@heroicons/react/24/outline';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { setOAuthReturnPathCookie } from '@/lib/oauth-return-path';
import { getBrowserAppOrigin } from '@/lib/app-origin';
import { SimpleAuthForm } from './SimpleAuthForm';
import {
  GoogleBrandIcon,
  GUEST_STORAGE_KEY,
  GUEST_NAME_STORAGE_KEY,
  GUEST_ROOM_KEY,
} from './JoinChoice';

export interface GuestRegisterPromptModalProps {
  open: boolean;
  onClose: () => void;
  /** OAuth 戻り先のパスに使う（未設定時は `window.location.pathname`） */
  roomId?: string;
}

function clearGuestSessionStorage(): void {
  try {
    sessionStorage.removeItem(GUEST_STORAGE_KEY);
    sessionStorage.removeItem(GUEST_NAME_STORAGE_KEY);
    sessionStorage.removeItem(GUEST_ROOM_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 部屋内のゲスト向け: Google / メールでの本登録を促すモーダル。
 */
export function GuestRegisterPromptModal({ open, onClose, roomId = '' }: GuestRegisterPromptModalProps) {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [termsDocModalOpen, setTermsDocModalOpen] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const supabase = createClient();
  const hasSupabase = isSupabaseConfigured() && supabase;

  useEffect(() => {
    if (!open) {
      setShowEmailForm(false);
      setTermsDocModalOpen(false);
      setTermsAgreed(false);
      setError(null);
      setAuthNotice(null);
    }
  }, [open]);

  useEffect(() => {
    if (!termsDocModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTermsDocModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [termsDocModalOpen]);

  if (!open) return null;

  const pathname =
    typeof window !== 'undefined'
      ? window.location.pathname
      : roomId
        ? `/${roomId}`
        : '/';

  const handleGoogle = async () => {
    if (!termsAgreed) {
      setError('登録を続けるには利用規約に同意してください。');
      return;
    }
    if (!hasSupabase) {
      setError('Google認証を使うには Supabase の設定が必要です。');
      return;
    }
    setError(null);
    const origin = getBrowserAppOrigin();
    setOAuthReturnPathCookie(pathname);
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(pathname)}`;
    if (process.env.NODE_ENV === 'development') {
      console.info('[OAuth] redirectTo →', redirectTo);
    }
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (err) {
      setError(err.message || 'Google認証に失敗しました。');
    }
  };

  const handleEmailAuthSuccess = () => {
    clearGuestSessionStorage();
    window.location.reload();
  };

  return (
    <>
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-register-modal-title"
      onClick={onClose}
    >
      <div
        className="max-h-[min(90vh,560px)] w-full max-w-md overflow-y-auto rounded-xl border border-gray-600 bg-gray-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {showEmailForm && hasSupabase ? (
          <>
            <SimpleAuthForm
              startWithRegister
              onSuccess={handleEmailAuthSuccess}
              onCancel={() => {
                setShowEmailForm(false);
                setError(null);
                setAuthNotice(null);
              }}
              onError={(m) => {
                if (m) setAuthNotice(null);
                setError(m || null);
              }}
              onAwaitingEmailConfirmation={(email) => {
                setError(null);
                setAuthNotice(
                  `登録を受け付けました（${email}）。確認メールのリンクを開いたあと、再度この部屋にアクセスしてログインしてください。迷惑メールフォルダも確認してください。`,
                );
              }}
              onResetEmailSent={(email) => {
                setError(null);
                setAuthNotice(
                  `パスワード再設定用のメールを送信しました（${email}）。メール内のリンクを開き、新しいパスワードを設定してください。`,
                );
              }}
            />
            {authNotice && (
              <p className="mt-3 text-sm text-emerald-300/95" role="status">
                {authNotice}
              </p>
            )}
            {error && (
              <p className="mt-3 text-sm text-red-400" role="alert">
                {error}
              </p>
            )}
          </>
        ) : (
          <>
            <h2 id="guest-register-modal-title" className="text-lg font-semibold text-white">
              ユーザー登録
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              登録するとお気に入り・履歴など、引き続き使える機能が増えます。お好みの方法を選んでください。
            </p>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              ご登録のメールアドレス等は、本サービスの提供・運営に必要な範囲でのみ利用し、無関係な目的には用いません。適切に管理します。
            </p>
            {hasSupabase ? (
              <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-3">
                <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-gray-200">
                  <input
                    type="checkbox"
                    checked={termsAgreed}
                    onChange={(e) => {
                      setTermsAgreed(e.target.checked);
                      if (e.target.checked) setError(null);
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-500 bg-gray-900 text-amber-600 focus:ring-amber-500"
                    aria-describedby="guest-register-terms-hint"
                  />
                  <span id="guest-register-terms-hint">
                    <button
                      type="button"
                      className="cursor-pointer text-sky-400 underline decoration-sky-400/50 underline-offset-2 hover:text-sky-300"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTermsDocModalOpen(true);
                      }}
                    >
                      利用規約
                    </button>
                    を読み、内容に同意します
                  </span>
                </label>
              </div>
            ) : null}
            <div className="mt-5 flex flex-col gap-3">
              {hasSupabase && (
                <button
                  type="button"
                  onClick={() => void handleGoogle()}
                  disabled={!termsAgreed}
                  className="flex items-center justify-center gap-3 rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <GoogleBrandIcon className="h-5 w-5 shrink-0" />
                  Googleで登録
                </button>
              )}
              {hasSupabase && (
                <button
                  type="button"
                  onClick={() => {
                    if (!termsAgreed) {
                      setError('登録を続けるには利用規約に同意してください。');
                      return;
                    }
                    setError(null);
                    setAuthNotice(null);
                    setShowEmailForm(true);
                  }}
                  disabled={!termsAgreed}
                  className="flex items-center justify-center gap-3 rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <EnvelopeIcon className="h-5 w-5 shrink-0 text-gray-300" aria-hidden />
                  メールアドレスで登録
                </button>
              )}
              {!hasSupabase && (
                <p className="text-center text-xs text-amber-500">
                  .env.local に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定すると、登録が利用できます。
                </p>
              )}
              {error && (
                <p className="text-center text-sm text-red-400" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-gray-700 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
              >
                閉じる
              </button>
            </div>
          </>
        )}
      </div>
    </div>

    {termsDocModalOpen ? (
      <div
        className="fixed inset-0 z-[65] flex items-center justify-center bg-black/80 p-3 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="利用規約"
        onClick={() => setTermsDocModalOpen(false)}
      >
        <div
          className="flex h-[min(88vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-600 bg-gray-900 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-700 px-3 py-2.5">
            <h3 className="text-sm font-semibold text-white">利用規約</h3>
            <button
              type="button"
              onClick={() => setTermsDocModalOpen(false)}
              className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
            >
              閉じる
            </button>
          </div>
          <iframe
            src="/terms?modal=1"
            title="利用規約"
            className="min-h-0 flex-1 w-full border-0 bg-gray-950"
          />
        </div>
      </div>
    ) : null}
    </>
  );
}
