'use client';

import type { ReactNode } from 'react';
import type { McUiFontSize } from '@/lib/mc-ui-font-size-preference';
import { mcUiFontSizeDataAttr } from '@/hooks/useMcUiFontSize';
import {
  libraryHeaderSecondaryBtnClass,
  libraryPanelDividerClass,
  mypageHeaderSubtitleClass,
  mypageHeaderTitleClass,
  mypageModalShellClass,
} from '@/lib/product-branding';

type MyPageModalFrameProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** mc — 部屋画面・マイページ共通の文字サイズ */
  fontSize?: McUiFontSize;
  children: ReactNode;
};

/** 部屋ライブラリモーダルと同系の大きいフルスクリーン風ダイアログ */
export function MyPageModalFrame({
  title,
  subtitle,
  onClose,
  fontSize = 'normal',
  children,
}: MyPageModalFrameProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={mypageModalShellClass()}
        data-mc-ui-font-size={mcUiFontSizeDataAttr(fontSize)}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2.5 sm:px-4 sm:py-3 ${libraryPanelDividerClass()}`}
        >
          <div className="min-w-0">
            <h2 className={mypageHeaderTitleClass()}>{title}</h2>
            {subtitle ? <p className={mypageHeaderSubtitleClass()}>{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={libraryHeaderSecondaryBtnClass(false)}
          >
            閉じる
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2 sm:px-4 sm:pb-4">{children}</div>
      </div>
    </div>
  );
}

/** PC では最大3カラム。col2/col3 を省略すると列数が減る */
export function MyPageThreeColumnBody({
  col1,
  col2,
  col3,
}: {
  col1: ReactNode;
  col2?: ReactNode;
  col3?: ReactNode;
}) {
  const hasCol2 = col2 != null;
  const hasCol3 = col3 != null;
  const gridCols =
    hasCol2 && hasCol3 ? 'lg:grid-cols-3' : hasCol2 || hasCol3 ? 'lg:grid-cols-2' : 'lg:grid-cols-1';

  return (
    <div className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto">
      <div className={`grid grid-cols-1 gap-3 pb-1 ${gridCols} lg:items-start`}>
        <div className="flex min-w-0 flex-col gap-3 lg:pr-1">{col1}</div>
        {hasCol2 ? <div className="flex min-w-0 flex-col gap-3 lg:px-1">{col2}</div> : null}
        {hasCol3 ? <div className="flex min-w-0 flex-col gap-3 lg:pl-1">{col3}</div> : null}
      </div>
    </div>
  );
}
