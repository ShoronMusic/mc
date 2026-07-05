'use client';

import { useEffect, useState } from 'react';
import {
  SITE_GUIDE_TAB_LABELS,
  SITE_GUIDE_TABS,
  siteGuideIframeSrc,
  type SiteGuideTab,
} from '@/lib/site-guide-modal';

export type { SiteGuideTab };

type SiteGuideModalProps = {
  open: boolean;
  onClose: () => void;
  initialTab?: SiteGuideTab;
  /** iframe の `returnTo`（部屋 ID など。先頭 / なし可） */
  returnToSegment?: string | null;
};

export function SiteGuideModal({
  open,
  onClose,
  initialTab = 'enjoy',
  returnToSegment = null,
}: SiteGuideModalProps) {
  const [activeTab, setActiveTab] = useState<SiteGuideTab>(initialTab);

  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="楽しみ方・サービス一覧・サイトマップ"
    >
      <div
        className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-700 px-3 py-2">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:thin]">
            {SITE_GUIDE_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 rounded px-2.5 py-1 text-xs ${
                  activeTab === tab
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                {SITE_GUIDE_TAB_LABELS[tab]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
          >
            閉じる
          </button>
        </div>
        <iframe
          key={activeTab}
          src={siteGuideIframeSrc(activeTab, returnToSegment)}
          title={SITE_GUIDE_TAB_LABELS[activeTab]}
          className="min-h-0 w-full flex-1 border-0 bg-gray-950"
        />
      </div>
    </div>
  );
}
