'use client';

import { MeetingStartPanel } from '@/components/home/MeetingStartPanel';
import { StartPageFooter } from '@/components/home/StartPageFooter';
import {
  StartPageSiteIntro,
  useStartPageIntroVisible,
} from '@/components/home/StartPageSiteIntro';
import { TopPageLoginAndLiveRooms } from '@/components/home/TopPageLoginAndLiveRooms';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { hasGuestRoomPersistence } from '@/lib/guest-room-persistence';
import { useEffect, useState } from 'react';

function StartPageTitle() {
  return (
    <h1 className="mb-6 text-center text-xl font-bold text-white lg:text-left">
      洋楽AIチャット（β版）
    </h1>
  );
}

function StartPageRoomEntryIntro({ showLoginHint = true }: { showLoginHint?: boolean }) {
  return (
    <>
      <p className="mb-6 text-center text-sm text-gray-400 lg:text-left">
        部屋を選んで入室してください
      </p>
      {showLoginHint ? (
        <p className="mb-4 text-center text-xs text-gray-500 lg:text-left">
          ログイン済みの方は主催者機能が使えます。未ログインの方は「新規で部屋を立ち上げる」または「ログインして過去の主催を再開」から入室方法を選べます。
        </p>
      ) : null}
    </>
  );
}

function useTopPageLoggedIn() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasGuestRoomPersistence()) {
      setIsLoggedIn(false);
      return;
    }
    const supabase = createClient();
    if (!isSupabaseConfigured() || !supabase) {
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
  }, []);

  return isLoggedIn;
}

function StartPageLoggedInLayout() {
  return (
    <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-lg sm:p-8 lg:max-w-6xl">
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="min-w-0 lg:sticky lg:top-20">
          <StartPageTitle />
          <StartPageRoomEntryIntro showLoginHint={false} />
          <TopPageLoginAndLiveRooms part="live" />
          <StartPageFooter usePolicyModal />
        </div>
        <div className="min-w-0">
          <MeetingStartPanel />
        </div>
      </div>
    </div>
  );
}

function StartPageGuestActionPanel() {
  return (
    <>
      <StartPageRoomEntryIntro />
      <TopPageLoginAndLiveRooms />
      <MeetingStartPanel />
      <StartPageFooter />
    </>
  );
}

/** ログイン前トップのメインカード。PC 幅では入室導線（左）と紹介（右）の 2 カラム。 */
export function StartPageMainCard() {
  const introVisible = useStartPageIntroVisible();
  const isLoggedIn = useTopPageLoggedIn();

  if (introVisible === false) {
    if (isLoggedIn !== false) {
      return <StartPageLoggedInLayout />;
    }

    return (
      <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-8 shadow-lg">
        <StartPageTitle />
        <StartPageGuestActionPanel />
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-lg sm:p-8 lg:max-w-6xl">
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="min-w-0 lg:sticky lg:top-20">
          <StartPageTitle />
          <StartPageGuestActionPanel />
        </div>
        <div className="min-w-0">
          <StartPageSiteIntro section="content" />
        </div>
      </div>
    </div>
  );
}
