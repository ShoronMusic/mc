'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  MC_UI_FONT_SIZE_UPDATED_EVENT,
  readMcUiFontSize,
  writeMcUiFontSize,
  type McUiFontSize,
} from '@/lib/mc-ui-font-size-preference';

/** 部屋画面・マイページ共通の文字サイズ（localStorage + 即時同期） */
export function useMcUiFontSize(): [McUiFontSize, (next: McUiFontSize) => void] {
  const [fontSize, setFontSize] = useState<McUiFontSize>(() =>
    typeof window === 'undefined' ? 'normal' : readMcUiFontSize(),
  );

  useEffect(() => {
    const sync = () => setFontSize(readMcUiFontSize());
    window.addEventListener(MC_UI_FONT_SIZE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(MC_UI_FONT_SIZE_UPDATED_EVENT, sync);
  }, []);

  const setFontSizePersisted = useCallback((next: McUiFontSize) => {
    writeMcUiFontSize(next);
    setFontSize(next);
  }, []);

  return [fontSize, setFontSizePersisted];
}

/** data-mc-ui-font-size 属性（normal は省略可） */
export function mcUiFontSizeDataAttr(size: McUiFontSize | undefined): McUiFontSize | undefined {
  if (!size || size === 'normal') return undefined;
  return size;
}
