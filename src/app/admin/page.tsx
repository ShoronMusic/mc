import Link from 'next/link';
import { ADMIN_SECTIONS } from '@/config/admin-sections';

export default function AdminDashboardPage() {
  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">管理ダッシュボード</h1>
          <p className="mt-2 text-sm text-gray-400">
            このエリアは <code className="rounded bg-gray-800 px-1 text-gray-300">STYLE_ADMIN_USER_IDS</code>{' '}
            に登録されたログインユーザーのみが開けます。各ツールの API にはさらに{' '}
            <code className="rounded bg-gray-800 px-1 text-gray-300">SUPABASE_SERVICE_ROLE_KEY</code>{' '}
            が必要なものがあります。
          </p>
        </header>

        <ul className="grid gap-4 sm:grid-cols-1">
          {ADMIN_SECTIONS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="block rounded-lg border border-gray-700 bg-gray-900/60 p-5 transition-colors hover:border-gray-500 hover:bg-gray-900"
              >
                <h2 className="text-lg font-medium text-white">{s.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">{s.description}</p>
                <span className="mt-3 inline-block text-sm text-sky-400">開く →</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-center text-xs text-gray-600">
          <Link href="/" className="hover:text-gray-500 hover:underline">
            トップへ戻る
          </Link>
        </p>
      </div>
    </main>
  );
}
