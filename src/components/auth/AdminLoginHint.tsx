'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/**
 * /admin から未ログインで弾かれたとき ?from=admin でトップに戻る案内
 */
export function AdminLoginHint() {
  const searchParams = useSearchParams();
  if (searchParams.get('from') !== 'admin') return null;

  return (
    <div className="mx-auto mb-4 max-w-md rounded-lg border border-amber-800/80 bg-amber-950/40 px-4 py-3 text-center text-sm text-amber-100">
      <p>
        <strong>管理画面</strong>を開くには、Google 等で<strong>ログイン</strong>したうえで、もう一度{' '}
        <Link href="/admin" className="font-medium text-amber-300 underline underline-offset-2 hover:text-amber-200">
          /admin
        </Link>{' '}
        にアクセスしてください。
      </p>
      <p className="mt-2 text-xs text-amber-200/80">
        部屋入室時の「Google で続行」でログインできます。アカウントは{' '}
        <code className="rounded bg-black/30 px-1">STYLE_ADMIN_USER_IDS</code> に登録されている必要があります。
      </p>
    </div>
  );
}
