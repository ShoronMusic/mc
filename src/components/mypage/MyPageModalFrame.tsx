'use client';

import type { ReactNode } from 'react';

type MyPageModalFrameProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
};

/** 部屋ライブラリモーダルと同系の大きいフルスクリーン風ダイアログ */
export function MyPageModalFrame({ title, subtitle, onClose, children }: MyPageModalFrameProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative flex h-[88vh] w-full max-w-[100rem] flex-col overflow-hidden rounded-lg border border-sky-600/50 bg-gray-950 text-left shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-sky-900/60 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white sm:text-base">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[11px] text-gray-400 sm:text-xs">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded border border-sky-700/60 bg-gray-800 px-3 text-xs text-sky-100 hover:bg-gray-700 sm:text-sm"
          >
            閉じる
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2 sm:px-4 sm:pb-4">{children}</div>
      </div>
    </div>
  );
}

/** PC では3カラム。モーダル内で縦スクロール（列の高さは揃えない） */
export function MyPageThreeColumnBody({
  col1,
  col2,
  col3,
}: {
  col1: ReactNode;
  col2: ReactNode;
  col3: ReactNode;
}) {
  return (
    <div className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto">
      <div className="grid grid-cols-1 gap-3 pb-1 lg:grid-cols-3 lg:items-start">
        <div className="flex min-w-0 flex-col gap-3 lg:pr-1">{col1}</div>
        <div className="flex min-w-0 flex-col gap-3 lg:px-1">{col2}</div>
        <div className="flex min-w-0 flex-col gap-3 lg:pl-1">{col3}</div>
      </div>
    </div>
  );
}
