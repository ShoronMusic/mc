'use client';

import { StartPageFirstReadModal } from '@/components/home/StartPageFirstReadModal';
import { MeetingStartPanel } from '@/components/home/MeetingStartPanel';
import { StartPageFooter } from '@/components/home/StartPageFooter';
import { StartPageSiteIntro } from '@/components/home/StartPageSiteIntro';
import { TopPageLoginAndLiveRooms } from '@/components/home/TopPageLoginAndLiveRooms';
import { useTopPageLoggedIn } from '@/components/home/use-top-page-auth';
import { MusicChatTitleBrand } from '@/components/home/MusicChatTitleLogo';
import { getProductDisplayName, IS_MC_PRODUCT } from '@/lib/product-branding';
import { hasGuestRoomPersistence } from '@/lib/guest-room-persistence';
import { useState } from 'react';

function StartPageTitle() {
  const [firstReadOpen, setFirstReadOpen] = useState(false);

  return (
    <>
      <h1
        className={`mb-2 flex justify-center lg:justify-start ${
          IS_MC_PRODUCT ? '' : 'text-center text-xl font-bold lg:text-left text-white'
        }`}
      >
        {IS_MC_PRODUCT ? (
          <MusicChatTitleBrand className="mx-auto lg:mx-0" />
        ) : (
          getProductDisplayName()
        )}
      </h1>
      <p className="mb-6 text-center text-sm lg:text-left">
        <button
          type="button"
          onClick={() => setFirstReadOpen(true)}
          className={
            IS_MC_PRODUCT
              ? 'text-gray-700 underline-offset-2 hover:text-gray-900 hover:underline'
              : 'text-amber-400 underline-offset-2 hover:underline'
          }
        >
          はじめにお読みください
        </button>
      </p>
      <StartPageFirstReadModal open={firstReadOpen} onClose={() => setFirstReadOpen(false)} />
    </>
  );
}

function StartPageRoomEntryIntro({ showLoginHint = true }: { showLoginHint?: boolean }) {
  return (
    <>
      <p
        className={`mb-6 text-center text-sm lg:text-left ${
          IS_MC_PRODUCT ? 'text-gray-600' : 'text-gray-400'
        }`}
      >
        {IS_MC_PRODUCT
          ? '邦楽も洋楽も OK。部屋を選んで入室してください'
          : '部屋を選んで入室してください'}
      </p>
      {showLoginHint ? (
        <p className="mb-4 text-center text-xs text-gray-500 lg:text-left">
          ログイン済みの方は主催者機能が使えます。未ログインの方は「新規で部屋を立ち上げる」または「ログインして主催した部屋を再開」から入室方法を選べます。
        </p>
      ) : null}
    </>
  );
}

function RightColumnAuthSkeleton() {
  return (
    <div
      className="rounded-xl border border-dashed border-slate-600/90 bg-slate-900/60 p-4 sm:p-5"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-center text-sm font-medium text-slate-100">メニューを準備しています…</p>
      <p className="mt-1.5 text-center text-[11px] leading-relaxed text-slate-400">
        ログイン状態を確認しています。しばらくお待ちください。
      </p>
      <div className="relative mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/90">
        <div
          className={`absolute inset-y-0 left-0 w-2/5 rounded-full motion-safe:animate-[gatherings-load-bar_1.4s_ease-in-out_infinite] ${
            IS_MC_PRODUCT ? 'bg-gray-400' : 'bg-sky-500/90'
          }`}
          aria-hidden
        />
      </div>
    </div>
  );
}

function StartPageLoggedInLayout() {
  return (
    <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-lg sm:p-8 lg:max-w-6xl">
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        {/* sticky に長い開催中一覧を入れると、一覧下部が viewport 外に固定されスクロール不能になる */}
        <div className="min-w-0">
          <StartPageTitle />
          <StartPageRoomEntryIntro showLoginHint={false} />
          <TopPageLoginAndLiveRooms part="live" />
          <StartPageFooter usePolicyModal />
        </div>
        <div className="min-w-0 lg:sticky lg:top-20">
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
  const isLoggedIn = useTopPageLoggedIn();

  // ログイン確定（またはセッション仮判定）後はすぐ主催者レイアウトへ（右が空のまま待たない）
  if (isLoggedIn === true) {
    return <StartPageLoggedInLayout />;
  }

  if (isLoggedIn === false) {
    // ゲスト参加確定後は紹介カラムを出さず、従来どおり単カラム
    if (hasGuestRoomPersistence()) {
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
          <div className="min-w-0">
            <StartPageTitle />
            <StartPageGuestActionPanel />
          </div>
          <div className="min-w-0 lg:sticky lg:top-20">
            <StartPageSiteIntro section="content" forceShow />
          </div>
        </div>
      </div>
    );
  }

  // auth 未解決: 右を空にせずスケルトンを出す
  return (
    <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-lg sm:p-8 lg:max-w-6xl">
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="min-w-0">
          <StartPageTitle />
          <StartPageRoomEntryIntro />
          <TopPageLoginAndLiveRooms part="live" />
          <StartPageFooter usePolicyModal />
        </div>
        <div className="min-w-0 lg:sticky lg:top-20">
          <RightColumnAuthSkeleton />
        </div>
      </div>
    </div>
  );
}
