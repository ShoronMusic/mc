import Link from 'next/link';
import { Suspense } from 'react';
import { ConsentEntryGate } from '@/components/auth/ConsentEntryGate';
import { FromStartMarker } from '@/components/auth/FromStartMarker';
import { TopPageAuthBar } from '@/components/auth/TopPageAuthBar';
import { TopPageLoginEntry } from '@/components/auth/TopPageLoginEntry';
import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
import { AdminLoginHint } from '@/components/auth/AdminLoginHint';
import { HomeRoomLinks } from '@/components/home/HomeRoomLinks';
import { MeetingStartPanel } from '@/components/home/MeetingStartPanel';

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
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-8 shadow-lg">
        <h1 className="mb-2 text-center text-xl font-bold text-white">洋楽AIチャット</h1>
        <p className="mb-6 text-center text-sm text-gray-400">
          ルームを選んで入室してください
        </p>
        <p className="mb-4 text-center text-xs text-gray-500">
          入室後、ゲスト・簡易登録・Google認証のいずれかで参加方法を選びます
        </p>
        <TopPageLoginEntry />
        <HomeRoomLinks />
        <MeetingStartPanel />
        <p className="mt-3 text-center text-xs text-amber-300/90">
          既に参加者がいる部屋に入ると、再生中の音楽がすぐ流れる場合があります。音量にご注意ください。
        </p>
        <p className="mt-4 text-center text-xs text-gray-500">
          ほかのルームは URL で /04, /05 … のように指定できます
        </p>
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
