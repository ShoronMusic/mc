'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  MC_UI_ACCENT_THEME_UPDATED_EVENT,
  applyMcUiAccentThemeToDocument,
  readMcUiAccentTheme,
  writeMcUiAccentTheme,
  type McUiAccentTheme,
} from '@/lib/mc-ui-accent-theme-preference';
import { IS_MC_PRODUCT } from '@/lib/product-branding';

/** mc — キーカラー（html 属性 + localStorage + 即時同期） */
export function useMcUiAccentTheme(): [McUiAccentTheme, (next: McUiAccentTheme) => void] {
  const [theme, setTheme] = useState<McUiAccentTheme>(() =>
    typeof window === 'undefined' ? 'green' : readMcUiAccentTheme(),
  );

  useEffect(() => {
    if (!IS_MC_PRODUCT) return;
    applyMcUiAccentThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    if (!IS_MC_PRODUCT) return;
    const sync = () => {
      const next = readMcUiAccentTheme();
      setTheme(next);
      applyMcUiAccentThemeToDocument(next);
    };
    window.addEventListener(MC_UI_ACCENT_THEME_UPDATED_EVENT, sync);
    return () => window.removeEventListener(MC_UI_ACCENT_THEME_UPDATED_EVENT, sync);
  }, []);

  const setThemePersisted = useCallback((next: McUiAccentTheme) => {
    writeMcUiAccentTheme(next);
    applyMcUiAccentThemeToDocument(next);
    setTheme(next);
  }, []);

  return [theme, setThemePersisted];
}

/** 初回ロード時に保存済みテーマを html へ反映 */
export function useMcUiAccentThemeDocumentSync(): void {
  useEffect(() => {
    if (!IS_MC_PRODUCT) return;
    applyMcUiAccentThemeToDocument(readMcUiAccentTheme());

    const sync = () => applyMcUiAccentThemeToDocument(readMcUiAccentTheme());
    window.addEventListener(MC_UI_ACCENT_THEME_UPDATED_EVENT, sync);
    return () => window.removeEventListener(MC_UI_ACCENT_THEME_UPDATED_EVENT, sync);
  }, []);
}
