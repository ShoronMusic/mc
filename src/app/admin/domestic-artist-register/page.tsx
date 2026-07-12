'use client';

import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { DomesticArtistListPanel } from '@/components/admin/DomesticArtistListPanel';

export default function AdminDomesticArtistRegisterPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />
      <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        邦楽アーティスト登録
      </h1>
      <p className="mt-2 text-sm text-gray-400">
        登録済みアーティストをクリックして編集します。新規は右上の「＋ 新規登録」から。
      </p>
      <DomesticArtistListPanel />
    </main>
  );
}
