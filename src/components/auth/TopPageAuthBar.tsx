'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { GUEST_STORAGE_KEY, GUEST_NAME_STORAGE_KEY, GUEST_ROOM_KEY } from './JoinChoice';

function getDisplayName(user: { user_metadata?: { display_name?: string; name?: string }; email?: string }): string {
  const meta = user?.user_metadata;
  if (meta?.display_name && typeof meta.display_name === 'string') return meta.display_name;
  if (meta?.name && typeof meta.name === 'string') return meta.name;
  if (user?.email) return user.email.split('@')[0];
  return 'ユーザー';
}

/**
 * トップページでログイン状態を表示し、ログアウトできるようにする。
 * メール登録のままにしていると参加方法の選択（Google認証など）が出ないため、切り替え用。
 */
export function TopPageAuthBar() {
  const searchParams = useSearchParams();
  const inPolicyModal = searchParams?.get('modal') === '1';
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasGuest = !!sessionStorage.getItem(GUEST_STORAGE_KEY);
    if (hasGuest) {
      const name = sessionStorage.getItem(GUEST_NAME_STORAGE_KEY)?.trim() || 'ゲスト';
      setDisplayName(name);
      setIsGuest(true);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    if (!isSupabaseConfigured() || !supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setDisplayName(session?.user ? getDisplayName(session.user) : null);
      setIsGuest(false);
      setLoading(false);
    });
  }, []);

  const handleLogout = async () => {
    if (isGuest) {
      try {
        sessionStorage.removeItem(GUEST_STORAGE_KEY);
        sessionStorage.removeItem(GUEST_NAME_STORAGE_KEY);
        sessionStorage.removeItem(GUEST_ROOM_KEY);
      } catch {}
      window.location.reload();
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setDisplayName(null);
    window.location.reload();
  };

  if (inPolicyModal || loading || !displayName) return null;

  return (
    <div className="fixed left-0 right-0 top-0 z-50 border-b border-gray-700 bg-gray-900/95 px-4 py-2 shadow-md">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 text-sm text-gray-300">
        <span>{displayName} として{isGuest ? 'ゲスト参加中' : 'ログイン中'}</span>
        <a
          href="/terms"
          className="text-xs text-gray-300 underline decoration-dotted underline-offset-2 hover:text-white"
          title="利用規約"
        >
          利用規約
        </a>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded border border-amber-600 bg-amber-900/50 px-3 py-1.5 text-amber-200 hover:bg-amber-800/70"
        >
          {isGuest ? 'クリアして参加方法を選び直す' : 'ログアウト'}
        </button>
        <span className="text-xs text-gray-500">
          （Google認証など別の方法で入室するには上記を押してからルームを選び直してください）
        </span>
      </div>
    </div>
  );
}
