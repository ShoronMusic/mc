'use client';

import { GuideFullNotice } from '@/components/guide/GuideFullNotice';

type StartPageFirstReadModalProps = {
  open: boolean;
  onClose: () => void;
};

/** トップの「はじめにお読みください」用。ご利用上の注意をモーダル表示 */
export function StartPageFirstReadModal({ open, onClose }: StartPageFirstReadModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-page-first-read-title"
    >
      <div className="flex h-[min(100vh-2rem,56rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-lg">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-700 px-5 py-4">
          <div className="min-w-0">
            <h2 id="start-page-first-read-title" className="text-xl font-bold text-white">
              洋楽AIチャット（β版）
            </h2>
            <p className="mt-1 text-xs text-gray-500">ご利用にあたって</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
          >
            閉じる
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <GuideFullNotice />
        </div>
      </div>
    </div>
  );
}
