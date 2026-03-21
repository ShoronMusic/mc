import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canUserAccessAdminPanel, isAdminPanelConfigured } from '@/lib/admin-access';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-6 text-center text-gray-200">
        <h1 className="text-lg font-semibold">管理画面を開けません</h1>
        <p className="mt-2 max-w-md text-sm text-gray-400">
          Supabase が設定されていません（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）。
        </p>
        <Link href="/" className="mt-6 text-sm text-sky-400 hover:underline">
          トップへ戻る
        </Link>
      </main>
    );
  }

  if (!isAdminPanelConfigured()) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-6 text-center text-gray-200">
        <h1 className="text-lg font-semibold">管理画面は無効です</h1>
        <p className="mt-2 max-w-md text-sm text-gray-400">
          サーバー環境変数{' '}
          <code className="rounded bg-gray-800 px-1 text-gray-300">STYLE_ADMIN_USER_IDS</code>{' '}
          に、管理者の Supabase User UUID をカンマ区切りで設定してください。未設定のままでは
          <strong className="text-gray-300"> 誰も </strong>
          /admin に入れません（誤って公開されるのを防ぎます）。
        </p>
        <Link href="/" className="mt-6 text-sm text-sky-400 hover:underline">
          トップへ戻る
        </Link>
      </main>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/?from=admin');
  }

  if (!canUserAccessAdminPanel(user.id)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-6 text-center text-gray-200">
        <h1 className="text-lg font-semibold text-amber-200">アクセスが拒否されました</h1>
        <p className="mt-2 max-w-md text-sm text-gray-400">
          このアカウントは管理用リスト（STYLE_ADMIN_USER_IDS）に含まれていません。Supabase
          Authentication の User UUID を .env.local に追加し、サーバーを再起動してください。
        </p>
        <Link href="/" className="mt-6 text-sm text-sky-400 hover:underline">
          トップへ戻る
        </Link>
      </main>
    );
  }

  return <>{children}</>;
}
