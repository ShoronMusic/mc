import type { ReactNode } from 'react';
import Link from 'next/link';
import { GuideSidebar } from '@/components/guide/GuideSidebar';

export default function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900/50">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href="/"
            className="text-sm text-gray-400 transition hover:text-white"
          >
            ← トップへ
          </Link>
          <span className="text-sm font-medium text-white">ご利用上の注意</span>
          <span className="w-16 sm:w-24" aria-hidden />
        </div>
      </header>
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
