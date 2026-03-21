'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_SECTIONS, isAdminSectionActive } from '@/config/admin-sections';

/**
 * 管理サブページ上部の共通メニュー（ダッシュボードへ戻る＋各ツール）
 */
export function AdminMenuBar() {
  const pathname = usePathname() ?? '';

  return (
    <nav
      className="mb-4 flex flex-col gap-3 border-b border-gray-800 pb-4 sm:flex-row sm:items-center sm:justify-between"
      aria-label="管理メニュー"
    >
      <Link
        href="/admin"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-amber-200/90 hover:text-amber-100"
      >
        <span aria-hidden>←</span> 管理ダッシュボード
      </Link>
      <ul className="flex flex-wrap gap-x-1 gap-y-2 text-sm">
        {ADMIN_SECTIONS.map((s) => {
          const active = isAdminSectionActive(pathname, s);
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                className={`rounded px-2.5 py-1 transition-colors ${
                  active
                    ? 'bg-gray-800 font-medium text-white ring-1 ring-gray-600'
                    : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {s.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
