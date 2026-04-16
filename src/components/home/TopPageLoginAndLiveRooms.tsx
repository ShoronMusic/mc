'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  TopPageLoginEntry,
  type TopPageLoginEntryIntent,
} from '@/components/auth/TopPageLoginEntry';
import { HomeRoomLinks } from '@/components/home/HomeRoomLinks';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

/**
 * 開催中（参加者あり）の部屋があるときは、その一覧を主催導線より上に置く。
 * flex の order で並べ替え、HomeRoomLinks を再マウントしない。
 *
 * 未ログイン時は「新規で部屋を立ち上げる」「過去の主催を再開（ログイン）」から選び、同じ認証UIへ進む。
 */
export function TopPageLoginAndLiveRooms() {
  const [hasActiveLiveRooms, setHasActiveLiveRooms] = useState(false);
  const [authIntent, setAuthIntent] = useState<TopPageLoginEntryIntent | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  const supabase = createClient();
  const hasSupabase = isSupabaseConfigured() && !!supabase;

  useEffect(() => {
    if (!hasSupabase || !supabase) {
      setIsLoggedIn(false);
      return;
    }
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setIsLoggedIn(!!data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void supabase.auth.getUser().then(({ data }) => {
        if (!active) return;
        setIsLoggedIn(!!data.user);
      });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [hasSupabase, supabase]);

  useEffect(() => {
    if (isLoggedIn === true) setAuthIntent(null);
  }, [isLoggedIn]);

  const handleActivePresenceKnown = useCallback((hasActive: boolean) => {
    setHasActiveLiveRooms(hasActive);
  }, []);

  function renderHostColumn() {
    if (isLoggedIn === true) {
      return <TopPageLoginEntry />;
    }
    if (isLoggedIn === null) {
      return <div className="min-h-[120px]" aria-hidden />;
    }
    if (authIntent === null) {
      return (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-gray-700 bg-gray-800/80 p-3">
          <button
            type="button"
            onClick={() => setAuthIntent('new-room')}
            className="flex w-full items-center justify-center rounded border border-gray-600 bg-gray-800 px-3 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            新規で部屋を立ち上げる
          </button>
          <button
            type="button"
            onClick={() => setAuthIntent('resume-host')}
            className="flex w-full items-center justify-center rounded border border-gray-600 bg-gray-800 px-3 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            ログインして過去に主催した部屋を再開する
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <TopPageLoginEntry entryIntent={authIntent} />
        <button
          type="button"
          onClick={() => setAuthIntent(null)}
          className="text-center text-xs text-gray-500 underline-offset-2 hover:text-gray-300 hover:underline"
        >
          戻る
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={hasActiveLiveRooms ? 'order-1' : 'order-2'}>
        <HomeRoomLinks onActivePresenceKnown={handleActivePresenceKnown} />
      </div>
      <div className={hasActiveLiveRooms ? 'order-2' : 'order-1'}>{renderHostColumn()}</div>
    </div>
  );
}
