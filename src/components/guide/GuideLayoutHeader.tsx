'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  getSafeInternalReturnPath,
  readRememberedGuideReturnPath,
} from '@/lib/safe-return-path';

export function GuideLayoutHeader() {
  const searchParams = useSearchParams();
  const fromQuery = getSafeInternalReturnPath(searchParams.get('returnTo'));
  const returnTo = fromQuery ?? readRememberedGuideReturnPath();

  return (
    <header className="border-b border-gray-800 bg-gray-900/50">
      <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 justify-self-start text-sm">
          <Link href="/" className="shrink-0 text-gray-400 transition hover:text-white">
            ← トップへ
          </Link>
          {returnTo ? (
            <Link
              href={returnTo}
              className="shrink-0 text-amber-400/95 underline-offset-2 transition hover:text-amber-300 hover:underline"
            >
              ← チャットページに戻る
            </Link>
          ) : null}
        </div>
        <span className="justify-self-center whitespace-nowrap text-sm font-medium text-white">
          ご利用上の注意
        </span>
        <span className="justify-self-end" aria-hidden />
      </div>
    </header>
  );
}
