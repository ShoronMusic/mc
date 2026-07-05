import type { Metadata } from 'next';
import Link from 'next/link';
import { ServiceCatalog } from '@/components/services/ServiceCatalog';

export const metadata: Metadata = {
  title: 'サービス一覧 | 洋楽AIチャット（β版）',
  description:
    '洋楽AIチャットの機能一覧です。無料の音楽チャット、クレジットが必要な AI、サイト負担の機能を区分して紹介します。',
};

type ServicesPageProps = {
  searchParams?: {
    modal?: string | string[];
  };
};

export default function ServicesPage({ searchParams }: ServicesPageProps) {
  const isModal =
    (Array.isArray(searchParams?.modal) ? searchParams?.modal[0] : searchParams?.modal) === '1';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {!isModal ? (
        <header className="border-b border-gray-800 bg-gray-900/50">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="text-sm text-gray-400 transition hover:text-white">
              ← トップへ
            </Link>
            <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
              <Link href="/sitemap" className="text-gray-400 transition hover:text-white">
                サイトマップ
              </Link>
              <Link href="/guide/enjoy" className="text-gray-400 transition hover:text-white">
                楽しみ方
              </Link>
              <Link href="/guide" className="text-gray-400 transition hover:text-white">
                ご利用上の注意 →
              </Link>
            </div>
          </div>
        </header>
      ) : null}

      <main className="mx-auto max-w-3xl px-4 py-8">
        <ServiceCatalog policyModal={isModal} />
      </main>
    </div>
  );
}
