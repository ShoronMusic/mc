import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteMapIndex } from '@/components/site/SiteMapIndex';

export const metadata: Metadata = {
  title: 'サイトマップ | 洋楽AIチャット（β版）',
  description:
    '洋楽AIチャットの公開ページ一覧です。サービス一覧・ガイド・規約・モーダル表示へのリンクをまとめています。',
};

type SiteMapPageProps = {
  searchParams?: {
    modal?: string | string[];
  };
};

export default function SiteMapPage({ searchParams }: SiteMapPageProps) {
  const isModal =
    (Array.isArray(searchParams?.modal) ? searchParams?.modal[0] : searchParams?.modal) === '1';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {!isModal ? (
        <header className="border-b border-gray-800 bg-gray-900/50">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="text-sm text-gray-300 transition hover:text-white">
              ← トップへ
            </Link>
            <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
              <Link href="/services" className="text-gray-300 transition hover:text-white">
                サービス一覧
              </Link>
              <Link href="/guide" className="text-gray-300 transition hover:text-white">
                ご利用上の注意 →
              </Link>
            </div>
          </div>
        </header>
      ) : null}

      <main className="mx-auto max-w-3xl px-4 py-8">
        <SiteMapIndex policyModal={isModal} />
      </main>
    </div>
  );
}
