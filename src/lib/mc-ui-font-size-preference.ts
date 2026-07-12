/**
 * mc 部屋画面・マイページ共通の文字サイズ。同一ブラウザに保存。
 */
export type McUiFontSize = 'normal' | 'large' | 'xlarge';

/** 後方互換 — 初版キー名のまま */
export const MC_UI_FONT_SIZE_STORAGE_KEY = 'mc_mypage_font_size:v1';

export const MC_UI_FONT_SIZE_UPDATED_EVENT = 'mc:ui-font-size-updated';

export const MC_UI_FONT_SIZE_OPTIONS: ReadonlyArray<{ id: McUiFontSize; label: string }> = [
  { id: 'normal', label: '標準' },
  { id: 'large', label: '大きく' },
  { id: 'xlarge', label: '特大' },
];

export function readMcUiFontSize(): McUiFontSize {
  if (typeof window === 'undefined') return 'normal';
  try {
    const v = window.localStorage.getItem(MC_UI_FONT_SIZE_STORAGE_KEY);
    if (v === 'large' || v === 'xlarge') return v;
    return 'normal';
  } catch {
    return 'normal';
  }
}

export function writeMcUiFontSize(size: McUiFontSize): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MC_UI_FONT_SIZE_STORAGE_KEY, size);
    window.dispatchEvent(new CustomEvent(MC_UI_FONT_SIZE_UPDATED_EVENT, { detail: { size } }));
  } catch {
    // noop
  }
}

/** @deprecated readMcUiFontSize を使用 */
export type MypageFontSize = McUiFontSize;

/** @deprecated MC_UI_FONT_SIZE_OPTIONS を使用 */
export const MYPAGE_FONT_SIZE_OPTIONS = MC_UI_FONT_SIZE_OPTIONS;

/** @deprecated readMcUiFontSize を使用 */
export const readMypageFontSize = readMcUiFontSize;

/** @deprecated writeMcUiFontSize を使用 */
export const writeMypageFontSize = writeMcUiFontSize;

/** @deprecated MC_UI_FONT_SIZE_STORAGE_KEY を使用 */
export const MYPAGE_FONT_SIZE_STORAGE_KEY = MC_UI_FONT_SIZE_STORAGE_KEY;
