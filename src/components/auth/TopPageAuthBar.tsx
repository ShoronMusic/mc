'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { loadBrowserSupabaseClient } from '@/lib/supabase/load-browser-client';
import { clearGuestRoomPersistence, hasGuestRoomPersistence, readGuestDisplayNameHint } from '@/lib/guest-room-persistence';
import { clearKnownAuthUserId } from '@/lib/share-target-pending';
import { IS_MC_PRODUCT } from '@/lib/product-branding';

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
    const hasGuest = hasGuestRoomPersistence();
    if (hasGuest) {
      const name = readGuestDisplayNameHint() || 'ゲスト';
      setDisplayName(name);
      setIsGuest(true);
      setLoading(false);
      return;
    }
    void loadBrowserSupabaseClient().then(({ client, configured }) => {
      if (!configured || !client) {
        setLoading(false);
        return;
      }
      // getSession はローカル参照で速い（並列 getUser のロック待ちを避ける）
      void client.auth.getSession().then(({ data }) => {
        const user = data.session?.user;
        setDisplayName(user ? getDisplayName(user) : null);
        setIsGuest(false);
        setLoading(false);
      });
    });
  }, []);

  const handleLogout = async () => {
    if (isGuest) {
      clearGuestRoomPersistence();
      clearKnownAuthUserId();
      window.location.reload();
      return;
    }
    const { client } = await loadBrowserSupabaseClient();
    if (!client) return;
    await client.auth.signOut();
    clearKnownAuthUserId();
    setDisplayName(null);
    window.location.reload();
  };

  if (inPolicyModal || loading || !displayName) return null;

  return (
    <div
      className={`fixed left-0 right-0 top-0 z-50 border-b px-4 py-2 ${
        IS_MC_PRODUCT
          ? 'border-gray-200 bg-white/95 shadow-sm'
          : 'border-gray-700 bg-gray-900/95 shadow-md'
      }`}
    >
      <div
        className={`mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 text-sm ${
          IS_MC_PRODUCT ? 'text-gray-700' : 'text-gray-300'
        }`}
      >
        <span>{displayName} として{isGuest ? 'ゲスト参加中' : 'ログイン中'}</span>
        <a
          href="/terms"
          className={
            IS_MC_PRODUCT
              ? 'text-xs text-gray-500 underline decoration-dotted underline-offset-2 hover:text-gray-900'
              : 'text-xs text-gray-300 underline decoration-dotted underline-offset-2 hover:text-white'
          }
          title="利用規約"
        >
          利用規約
        </a>
        <button
          type="button"
          onClick={handleLogout}
          className={
            IS_MC_PRODUCT
              ? 'rounded border border-gray-400 bg-gray-100 px-3 py-1.5 text-gray-800 hover:bg-gray-200'
              : 'rounded border border-amber-600 bg-amber-900/50 px-3 py-1.5 text-amber-200 hover:bg-amber-800/70'
          }
        >
          {isGuest ? 'クリアして参加方法を選び直す' : 'ログアウト'}
        </button>
        <span className={`text-xs ${IS_MC_PRODUCT ? 'text-gray-500' : 'text-gray-500'}`}>
          （Google認証など別の方法で入室するには上記を押してから部屋を選び直してください）
        </span>
      </div>
    </div>
  );
}
