import { Suspense } from 'react';
import { AdminDashboardTabs } from '@/components/admin/AdminDashboardTabs';

export default function AdminDashboardPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 text-gray-100 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">管理ダッシュボード</h1>
      <p className="mt-2 text-sm text-gray-400">
        利用状況の確認・運用メンテナンス向けページです。カテゴリを選んで各ツールを開けます。
      </p>

      <Suspense fallback={<p className="mt-6 text-sm text-gray-500">読み込み中…</p>}>
        <AdminDashboardTabs />
      </Suspense>
    </main>
  );
}
