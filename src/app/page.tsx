import Link from 'next/link';
import { Suspense } from 'react';
import { ConsentEntryGate } from '@/components/auth/ConsentEntryGate';
import { FromStartMarker } from '@/components/auth/FromStartMarker';
import { TopPageAuthBar } from '@/components/auth/TopPageAuthBar';
import { TopPageLoginAndLiveRooms } from '@/components/home/TopPageLoginAndLiveRooms';
import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
import { AdminLoginHint } from '@/components/auth/AdminLoginHint';
import { MeetingStartPanel } from '@/components/home/MeetingStartPanel';
import { StartPageSiteIntro } from '@/components/home/StartPageSiteIntro';

export default function StartPage() {
  return (
    <ConsentEntryGate>
      <FromStartMarker />
      <TopPageAuthBar />
      <Suspense fallback={null}>
        <AuthErrorBanner />
      </Suspense>
      <Suspense fallback={null}>
        <div className="flex justify-center px-4 pt-14">
          <AdminLoginHint />
        </div>
      </Suspense>
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-4 pt-16">
      <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-8 shadow-lg">
        <StartPageSiteIntro />
        <p className="mb-6 text-center text-sm text-gray-400">
          部屋を選んで入室してください
        </p>
        <p className="mb-4 text-center text-xs text-gray-500">
          ログイン済みの方は主催者機能が使えます。未ログインの方は「新規で部屋を立ち上げる」または「ログインして過去の主催を再開」から入室方法を選べます。
        </p>
        <TopPageLoginAndLiveRooms />
        <MeetingStartPanel />
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
    </ConsentEntryGate>
  );
}
