import type { ReactNode } from 'react';
import Link from 'next/link';
import { Suspense } from 'react';
import { GuideLayoutHeader } from '@/components/guide/GuideLayoutHeader';
import { GuideSidebar } from '@/components/guide/GuideSidebar';

function GuideHeaderFallback() {
  return (
    <header className="border-b border-gray-800 bg-gray-900/50">
      <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 justify-self-start text-sm">
          <Link href="/" className="shrink-0 text-gray-400 transition hover:text-white">
            ← トップへ
          </Link>
        </div>
        <span className="justify-self-center whitespace-nowrap text-sm font-medium text-white">
          ご利用上の注意
        </span>
        <span className="justify-self-end" aria-hidden />
      </div>
    </header>
  );
}

export default function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Suspense fallback={<GuideHeaderFallback />}>
        <GuideLayoutHeader />
      </Suspense>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <aside className="md:w-56 md:shrink-0">
            <GuideSidebar />
          </aside>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
