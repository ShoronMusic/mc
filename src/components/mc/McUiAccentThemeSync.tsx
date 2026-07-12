'use client';

import { useMcUiAccentThemeDocumentSync } from '@/hooks/useMcUiAccentTheme';

/** mc — 保存済みキーカラーを html に適用（全ページ共通） */
export function McUiAccentThemeSync() {
  useMcUiAccentThemeDocumentSync();
  return null;
}
