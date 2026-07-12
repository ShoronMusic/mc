'use client';

import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { DomesticArtistListPanel } from '@/components/admin/DomesticArtistListPanel';
import Link from 'next/link';

export default function AdminDomesticArtistRegisterPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />
      <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        邦楽アーティスト登録
      </h1>
      <p className="mt-2 text-sm text-gray-400">
        ここが邦楽 artists の編集入口です（ライブラリ詳細は閲覧のみ）。登録済みは下の一覧をクリック。
        選曲でできた未整備行は{' '}
        <Link href="/admin/artists-newly-registered" className="text-sky-300 hover:underline">
          選曲登録アーティスト（日別）
        </Link>
        から「邦楽登録で編集」。ゼロから作る場合は「＋ 新規登録」。
      </p>
      <DomesticArtistListPanel />
    </main>
  );
}
