'use client';

import { EnvelopeIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { getBrowserAppOrigin } from '@/lib/app-origin';
import { setOAuthReturnPathCookie } from '@/lib/oauth-return-path';
import { TRIAL_ROOM_IDS, pickTrialRoomId } from '@/lib/trial-rooms';
import { FROM_START_KEY } from './FromStartMarker';
import { GUEST_NAME_STORAGE_KEY, GUEST_ROOM_KEY, GUEST_STORAGE_KEY } from './JoinChoice';
import { SimpleAuthForm } from './SimpleAuthForm';

function GoogleBrandIcon({ className }: { className?: string }) {
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

/**
 * 会が未開催でもトップからログインできる最小導線。
 */
export function TopPageLoginEntry() {
  const supabase = createClient();
  const hasSupabase = isSupabaseConfigured() && !!supabase;
  const [showSimpleForm, setShowSimpleForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [guestJoining, setGuestJoining] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!hasSupabase || !supabase) {
      setIsLoggedIn(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setIsLoggedIn(!!data.session?.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setIsLoggedIn(!!session?.user);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [hasSupabase, supabase]);

  const handleGoogle = async () => {
    if (!hasSupabase || !supabase) {
      setError('Google認証を使うには Supabase の設定が必要です。');
      return;
    }
    setError(null);
    const origin = getBrowserAppOrigin();
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
    setOAuthReturnPathCookie(pathname);
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(pathname)}`;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (err) {
      setError(err.message || 'Google認証に失敗しました。');
    }
  };

  const handleGuestJoin = async () => {
    setError(null);
    setGuestJoining(true);
    try {
      const ids = TRIAL_ROOM_IDS.join(',');
      const res = await fetch(`/api/room-presence?rooms=${encodeURIComponent(ids)}`);
      const data = (await res.json().catch(() => ({}))) as {
        rooms?: Array<{ roomId: string; count: number; error?: boolean }>;
      };
      const candidates = (data.rooms ?? [])
        .filter((r) => TRIAL_ROOM_IDS.includes(r.roomId) && !r.error)
        .sort((a, b) => {
          if (a.count !== b.count) return a.count - b.count;
          return a.roomId.localeCompare(b.roomId);
        });
      const selected = candidates[0]?.roomId || pickTrialRoomId();
      try {
        sessionStorage.setItem(GUEST_STORAGE_KEY, '1');
        sessionStorage.setItem(GUEST_NAME_STORAGE_KEY, 'ゲスト');
        sessionStorage.setItem(GUEST_ROOM_KEY, selected);
        sessionStorage.removeItem(FROM_START_KEY);
      } catch {}
      window.location.href = `/${encodeURIComponent(selected)}`;
      return;
    } catch {
      // 通信に失敗した場合だけランダムにフォールバック
      const fallback = pickTrialRoomId();
      try {
        sessionStorage.setItem(GUEST_STORAGE_KEY, '1');
        sessionStorage.setItem(GUEST_NAME_STORAGE_KEY, 'ゲスト');
        sessionStorage.setItem(GUEST_ROOM_KEY, fallback);
        sessionStorage.removeItem(FROM_START_KEY);
      } catch {}
      window.location.href = `/${encodeURIComponent(fallback)}`;
      return;
    } finally {
      setGuestJoining(false);
    }
  };

  if (isLoggedIn === true) {
    return null;
  }

  return (
    <>
      <div className="mb-4 rounded-lg border border-gray-700 bg-gray-800/80 p-3">
        <p className="mb-2 text-center text-xs text-gray-400">主催者機能の利用にはログインが必要です</p>
        <div className="flex flex-col gap-2">
          {hasSupabase && (
            <button
              type="button"
              onClick={handleGoogle}
              className="flex items-center justify-center gap-2 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700"
            >
              <GoogleBrandIcon className="h-4 w-4 shrink-0" />
              Googleでログイン
            </button>
          )}
          {hasSupabase && (
            <button
              type="button"
              onClick={() => {
                setShowSimpleForm(true);
                setError(null);
                setAuthNotice(null);
              }}
              className="flex items-center justify-center gap-2 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700"
            >
              <EnvelopeIcon className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
              メールアドレスでログイン
            </button>
          )}
          <button
            type="button"
            onClick={handleGuestJoin}
            disabled={guestJoining}
            className="flex items-center justify-center gap-2 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700"
          >
            {guestJoining ? 'ゲスト向けルームを準備中…' : 'ゲストで参加'}
          </button>
          {!hasSupabase && (
            <p className="text-center text-xs text-amber-400">
              Supabase 未設定のためログイン機能を表示できません。
            </p>
          )}
        </div>
        {error && <p className="mt-2 text-center text-xs text-red-400">{error}</p>}
      </div>

      {showSimpleForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-900 p-6">
            <SimpleAuthForm
              onSuccess={() => {
                setShowSimpleForm(false);
                window.location.reload();
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
                  `登録を受け付けました（${email}）。確認メールのリンクを開いたあと、再度ログインしてください。迷惑メールフォルダも確認してください。`,
                );
              }}
            />
            {authNotice && <p className="mt-3 text-sm text-emerald-300/95">{authNotice}</p>}
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
