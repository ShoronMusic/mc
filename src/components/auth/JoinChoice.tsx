'use client';

import { EnvelopeIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { assignDefaultGuestDisplayName } from '@/lib/guest-display-name';
import { setOAuthReturnPathCookie } from '@/lib/oauth-return-path';
import { getBrowserAppOrigin } from '@/lib/app-origin';
import { SimpleAuthForm } from './SimpleAuthForm';

export const GUEST_STORAGE_KEY = 'mc:guest';
export const GUEST_NAME_STORAGE_KEY = 'mc:guest_name';
export const GUEST_ROOM_KEY = 'mc:guest_room';

export function GoogleBrandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function getInitialGuestHandle(): string {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(GUEST_NAME_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export interface JoinChoiceProps {
  onJoin: (displayName: string, mode: 'guest' | 'registered') => void | Promise<void>;
  roomId: string;
  /** 参加ボタン押下後、開催再確認中 */
  joinVerifying?: boolean;
}

export function JoinChoice({ onJoin, roomId, joinVerifying = false }: JoinChoiceProps) {
  const [showSimpleForm, setShowSimpleForm] = useState(false);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestHandle, setGuestHandle] = useState(getInitialGuestHandle);
  const [error, setError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const supabase = createClient();
  const hasSupabase = isSupabaseConfigured() && supabase;

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guestSubmitting || joinVerifying) return;
    setGuestSubmitting(true);
    try {
      const name = guestHandle.trim() || assignDefaultGuestDisplayName();
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(GUEST_STORAGE_KEY, '1');
          sessionStorage.setItem(GUEST_NAME_STORAGE_KEY, name);
          sessionStorage.setItem(GUEST_ROOM_KEY, roomId);
        } catch {}
      }
      await onJoin(name, 'guest');
    } finally {
      setGuestSubmitting(false);
    }
  };

  const handleSimpleAuthSuccess = async (displayName: string) => {
    setError(null);
    await onJoin(displayName, 'registered');
  };

  const handleGoogle = async () => {
    if (!hasSupabase) {
      setError('Google認証を使うには Supabase の設定が必要です。');
      return;
    }
    setError(null);
    const origin = getBrowserAppOrigin();
    const pathname = typeof window !== 'undefined' ? window.location.pathname : `/${roomId}`;
    setOAuthReturnPathCookie(pathname);
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(pathname)}`;
    if (process.env.NODE_ENV === 'development') {
      // Supabase が redirectTo を拒否すると Site URL（本番）へ ?code= だけ飛ばすことがある。Network タブの authorize URL と照合する。
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

  if (showSimpleForm && hasSupabase) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-4">
        <div className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-900 p-6">
          <SimpleAuthForm
            onSuccess={(dn) => {
              void handleSimpleAuthSuccess(dn);
            }}
            onCancel={() => {
              setShowSimpleForm(false);
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
                `登録を受け付けました（${email}）。確認メールのリンクを開いたあと、「すでに登録済みの方はログイン」からログインしてください。迷惑メールフォルダも確認してください。`
              );
            }}
            onResetEmailSent={(email) => {
              setError(null);
              setAuthNotice(
                `パスワード再設定用のメールを送信しました（${email}）。メール内のリンクを開き、新しいパスワードを設定してください。迷惑メールフォルダもご確認ください。`
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
        </div>
      </div>
    );
  }

  if (showGuestForm) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-4">
        <div className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">ゲストで参加</h2>
          <p className="mb-3 text-sm text-gray-400">
            ハンドルネームを入力してください（未入力の場合は「ゲスト」＋番号が自動で付きます。例: ゲスト4821）
          </p>
          <form onSubmit={(e) => void handleGuestSubmit(e)} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-300">ハンドルネーム</span>
              <input
                type="text"
                value={guestHandle}
                onChange={(e) => setGuestHandle(e.target.value)}
                placeholder="ゲスト"
                maxLength={30}
                disabled={guestSubmitting || joinVerifying}
                className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 disabled:opacity-50"
                autoComplete="nickname"
              />
            </label>
            {(guestSubmitting || joinVerifying) && (
              <p className="text-sm text-gray-400" role="status">
                開催状況を確認しています…
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={guestSubmitting || joinVerifying}
                className="flex-1 rounded-lg bg-amber-600 px-3 py-2 font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
              >
                参加する
              </button>
              <button
                type="button"
                disabled={guestSubmitting || joinVerifying}
                onClick={() => setShowGuestForm(false)}
                className="rounded-lg border border-gray-600 px-3 py-2 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                キャンセル
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-8 shadow-lg">
        <h1 className="mb-2 text-center text-xl font-bold text-white">洋楽AIチャット（β版）</h1>
        <p className="mb-6 text-center text-sm text-gray-400">
          チャットに参加する方法を選んでください
        </p>
        <div className="flex flex-col gap-3">
          {hasSupabase && (
            <button
              type="button"
              onClick={handleGoogle}
              className="flex items-center justify-center gap-3 rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white transition hover:bg-gray-700"
            >
              <GoogleBrandIcon className="h-5 w-5 shrink-0" />
              Googleでログイン
            </button>
          )}
          {hasSupabase && (
            <button
              type="button"
              onClick={() => setShowSimpleForm(true)}
              className="flex items-center justify-center gap-3 rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white transition hover:bg-gray-700"
            >
              <EnvelopeIcon className="h-5 w-5 shrink-0 text-gray-300" aria-hidden />
              メールアドレスでログイン
            </button>
          )}
          <button
            type="button"
            disabled={joinVerifying}
            onClick={() => setShowGuestForm(true)}
            className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white transition hover:bg-gray-700 disabled:opacity-50"
          >
            ゲストで参加
          </button>
        </div>
        {!hasSupabase && (
          <p className="mt-4 text-center text-xs text-amber-500">
            .env.local に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定すると、メールでの登録・ログインと Google でログインが使えます。
          </p>
        )}
        {error && (
          <p className="mt-4 text-center text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-gray-500">
          <Link href="/guide" className="underline-offset-2 hover:text-gray-300 hover:underline">
            ご利用上の注意
          </Link>
          <span aria-hidden className="text-gray-600">
            |
          </span>
          <Link href="/terms" className="underline-offset-2 hover:text-gray-300 hover:underline">
            利用規約
          </Link>
        </p>
      </div>
    </div>
  );
}
