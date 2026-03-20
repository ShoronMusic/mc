import Link from 'next/link';
import { Suspense } from 'react';
import { ConsentEntryGate } from '@/components/auth/ConsentEntryGate';
import { FromStartMarker } from '@/components/auth/FromStartMarker';
import { TopPageAuthBar } from '@/components/auth/TopPageAuthBar';
import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';

export default function StartPage() {
  return (
    <ConsentEntryGate>
      <FromStartMarker />
      <TopPageAuthBar />
      <Suspense fallback={null}>
        <AuthErrorBanner />
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
        <div className="flex flex-col gap-3">
          <Link
            href="/01"
            className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-center text-white transition hover:bg-gray-700"
          >
            01 ルームに入る
          </Link>
          <Link
            href="/02"
            className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-center text-white transition hover:bg-gray-700"
          >
            02 ルームに入る
          </Link>
          <Link
            href="/03"
            className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-center text-white transition hover:bg-gray-700"
          >
            03 ルームに入る
          </Link>
        </div>
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
