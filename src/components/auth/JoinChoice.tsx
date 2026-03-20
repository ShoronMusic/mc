'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { SimpleAuthForm } from './SimpleAuthForm';

export const GUEST_STORAGE_KEY = 'mc:guest';
export const GUEST_NAME_STORAGE_KEY = 'mc:guest_name';
export const GUEST_ROOM_KEY = 'mc:guest_room';

function getInitialGuestHandle(): string {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(GUEST_NAME_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export interface JoinChoiceProps {
  onJoin: (displayName: string, mode: 'guest' | 'registered') => void;
  roomId: string;
}

export function JoinChoice({ onJoin, roomId }: JoinChoiceProps) {
  const [showSimpleForm, setShowSimpleForm] = useState(false);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestHandle, setGuestHandle] = useState(getInitialGuestHandle);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const hasSupabase = isSupabaseConfigured() && supabase;

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = guestHandle.trim() || 'ゲスト';
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(GUEST_STORAGE_KEY, '1');
        sessionStorage.setItem(GUEST_NAME_STORAGE_KEY, name);
        sessionStorage.setItem(GUEST_ROOM_KEY, roomId);
      } catch {}
    }
    onJoin(name, 'guest');
  };

  const handleSimpleAuthSuccess = (displayName: string) => {
    setError(null);
    onJoin(displayName, 'registered');
  };

  const handleGoogle = async () => {
    if (!hasSupabase) {
      setError('Google認証を使うには Supabase の設定が必要です。');
      return;
    }
    setError(null);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const pathname = typeof window !== 'undefined' ? window.location.pathname : `/${roomId}`;
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(pathname)}`;
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
          <h2 className="mb-4 text-lg font-semibold text-white">簡易登録 / ログイン</h2>
          <SimpleAuthForm
            onSuccess={handleSimpleAuthSuccess}
            onCancel={() => setShowSimpleForm(false)}
            onError={setError}
          />
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
            ハンドルネームを入力してください（未入力の場合は「ゲスト」で表示されます）
          </p>
          <form onSubmit={handleGuestSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-300">ハンドルネーム</span>
              <input
                type="text"
                value={guestHandle}
                onChange={(e) => setGuestHandle(e.target.value)}
                placeholder="ゲスト"
                maxLength={30}
                className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500"
                autoComplete="nickname"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-amber-600 px-3 py-2 font-medium text-white transition hover:bg-amber-500"
              >
                参加する
              </button>
              <button
                type="button"
                onClick={() => setShowGuestForm(false)}
                className="rounded-lg border border-gray-600 px-3 py-2 text-gray-300 hover:bg-gray-800"
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
        <h1 className="mb-2 text-center text-xl font-bold text-white">洋楽AIチャット</h1>
        <p className="mb-6 text-center text-sm text-gray-400">
          チャットに参加する方法を選んでください
        </p>
        <div className="flex flex-col gap-3">
          {hasSupabase && (
            <button
              type="button"
              onClick={() => setShowSimpleForm(true)}
              className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white transition hover:bg-gray-700"
            >
              簡易登録（メールで登録・ログイン）
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowGuestForm(true)}
            className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white transition hover:bg-gray-700"
          >
            ゲストで参加
          </button>
          {hasSupabase && (
            <button
              type="button"
              onClick={handleGoogle}
              className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white transition hover:bg-gray-700"
            >
              Google認証で参加
            </button>
          )}
        </div>
        {!hasSupabase && (
          <p className="mt-4 text-center text-xs text-amber-500">
            .env.local に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定すると簡易登録・Google認証が使えます。
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
