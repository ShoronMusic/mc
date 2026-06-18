'use client';

import { useEffect, useState } from 'react';

export type PolicyDocsTab = 'terms' | 'privacy' | 'guide' | 'enjoy';

type PolicyDocsModalProps = {
  open: boolean;
  onClose: () => void;
  initialTab?: PolicyDocsTab;
  /** iframe の `returnTo`（部屋 ID など。先頭 / なし可） */
  returnToSegment?: string | null;
};

function policyDocsIframeSrc(tab: PolicyDocsTab, returnToSegment?: string | null): string {
  const seg = returnToSegment?.trim();
  const returnQ = seg ? `&returnTo=${encodeURIComponent(seg)}` : '';
  switch (tab) {
    case 'terms':
      return `/terms?modal=1${returnQ}`;
    case 'privacy':
      return `/privacy?modal=1${returnQ}`;
    case 'guide':
      return `/guide?modal=1${returnQ}`;
    case 'enjoy':
      return `/guide/enjoy?modal=1${returnQ}`;
    default:
      return `/terms?modal=1${returnQ}`;
  }
}

const TAB_LABELS: Record<PolicyDocsTab, string> = {
  enjoy: '楽しみ方',
  guide: 'ご利用上の注意',
  terms: '利用規約',
  privacy: 'プライバシー',
};

export function PolicyDocsModal({
  open,
  onClose,
  initialTab = 'terms',
  returnToSegment = null,
}: PolicyDocsModalProps) {
  const [activeTab, setActiveTab] = useState<PolicyDocsTab>(initialTab);

  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ご案内・規約"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-700 px-3 py-2">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:thin]">
            {(['enjoy', 'guide', 'terms', 'privacy'] as const).map((tab) => (
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
                {TAB_LABELS[tab]}
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
          src={policyDocsIframeSrc(activeTab, returnToSegment)}
          title={TAB_LABELS[activeTab]}
          className="min-h-0 w-full flex-1 border-0 bg-gray-950"
        />
      </div>
    </div>
  );
}
