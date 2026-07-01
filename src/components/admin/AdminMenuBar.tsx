'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ADMIN_CATEGORIES,
  ADMIN_SECTIONS,
  getAdminCategoryForPathname,
  getAdminSectionsByCategory,
  isAdminSectionActive,
} from '@/config/admin-sections';

/**
 * 管理サブページ上部の共通メニュー（ダッシュボードへ戻る＋カテゴリタブ＋同カテゴリ内リンク）
 */
export function AdminMenuBar() {
  const pathname = usePathname() ?? '';
  const activeCategory = getAdminCategoryForPathname(pathname);
  const categorySections = getAdminSectionsByCategory(activeCategory);

  return (
    <nav className="mb-4 space-y-3 border-b border-gray-800 pb-4" aria-label="管理メニュー">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/admin?tab=${activeCategory}`}
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-amber-200/90 hover:text-amber-100"
        >
          <span aria-hidden>←</span> 管理ダッシュボード
        </Link>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="管理カテゴリ">
          {ADMIN_CATEGORIES.map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <Link
                key={cat.id}
                href={`/admin?tab=${cat.id}`}
                role="tab"
                aria-selected={active}
                className={`rounded px-2.5 py-1 text-xs transition-colors sm:text-sm ${
                  active
                    ? 'bg-gray-800 font-medium text-amber-200 ring-1 ring-gray-600'
                    : 'text-gray-500 hover:bg-gray-900 hover:text-gray-300'
                }`}
              >
                {cat.label}
              </Link>
            );
          })}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-1 gap-y-1.5 text-sm">
        {categorySections.map((s) => {
          const active = isAdminSectionActive(pathname, s);
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                className={`rounded px-2.5 py-1 transition-colors ${
                  active
                    ? 'bg-violet-950/50 font-medium text-violet-100 ring-1 ring-violet-800/60'
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
