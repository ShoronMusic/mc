import Link from 'next/link';
import { ADMIN_SECTIONS } from '@/config/admin-sections';

export default function AdminDashboardPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 text-gray-100 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">管理ダッシュボード</h1>
      <p className="mt-2 text-sm text-gray-400">
        利用状況の確認・運用メンテナンス向けページです。下記から各ツールを開けます。
      </p>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ADMIN_SECTIONS.map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              className="block rounded-lg border border-gray-800 bg-gray-900/60 p-4 transition-colors hover:border-gray-700 hover:bg-gray-900"
            >
              <p className="text-base font-medium text-amber-200">{section.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-400">{section.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

