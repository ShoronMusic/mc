'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  ADMIN_CATEGORIES,
  type AdminCategoryId,
  getAdminCategoryMeta,
  getAdminSectionsByCategory,
  isAdminCategoryId,
  countAdminSectionsByCategory,
} from '@/config/admin-sections';

function readInitialTab(searchParams: ReturnType<typeof useSearchParams>): AdminCategoryId {
  const tab = searchParams.get('tab')?.trim() ?? '';
  if (isAdminCategoryId(tab)) return tab;
  return 'billing';
}

export function AdminDashboardTabs() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<AdminCategoryId>(() => readInitialTab(searchParams));
  const counts = useMemo(() => countAdminSectionsByCategory(), []);
  const sections = useMemo(() => getAdminSectionsByCategory(activeTab), [activeTab]);
  const categoryMeta = getAdminCategoryMeta(activeTab);

  const selectTab = useCallback((id: AdminCategoryId) => {
    setActiveTab(id);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', id);
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);

  return (
    <div className="mt-6">
      <div
        className="flex gap-1 overflow-x-auto border-b border-gray-800 pb-px"
        role="tablist"
        aria-label="管理カテゴリ"
      >
        {ADMIN_CATEGORIES.map((cat) => {
          const selected = activeTab === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectTab(cat.id)}
              className={`shrink-0 rounded-t-lg px-3 py-2 text-sm transition-colors sm:px-4 ${
                selected
                  ? 'border border-b-0 border-gray-700 bg-gray-900 font-medium text-amber-200'
                  : 'text-gray-400 hover:bg-gray-900/60 hover:text-gray-200'
              }`}
            >
              {cat.label}
              <span className="ml-1.5 text-xs text-gray-500">({counts[cat.id]})</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="rounded-b-lg border border-t-0 border-gray-800 bg-gray-900/30 p-4 sm:p-5">
        <p className="text-sm text-gray-400">{categoryMeta.description}</p>

        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sections.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="block h-full rounded-lg border border-gray-800 bg-gray-950/50 p-4 transition-colors hover:border-gray-600 hover:bg-gray-900/80"
              >
                <p className="text-base font-medium text-amber-200">{section.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-400">{section.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
