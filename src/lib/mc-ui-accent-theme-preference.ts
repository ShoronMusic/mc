/**
 * mc 部屋画面・マイページ共通のキーカラー（アクセント）。同一ブラウザに保存。
 */
export type McUiAccentTheme =
  | 'green'
  | 'teal'
  | 'blue'
  | 'navy'
  | 'violet'
  | 'orange'
  | 'brown'
  | 'pink'
  | 'gold'
  | 'black'
  | 'gray';

export const MC_UI_ACCENT_THEME_STORAGE_KEY = 'mc_ui_accent_theme:v1';

export const MC_UI_ACCENT_THEME_UPDATED_EVENT = 'mc:ui-accent-theme-updated';

export type McUiAccentThemeOption = {
  id: McUiAccentTheme;
  label: string;
  swatch: string;
};

export const MC_UI_ACCENT_THEME_OPTIONS: ReadonlyArray<McUiAccentThemeOption> = [
  { id: 'green', label: 'グリーン', swatch: '#16a34a' },
  { id: 'teal', label: 'ティール', swatch: '#0d9488' },
  { id: 'blue', label: 'ブルー', swatch: '#2563eb' },
  { id: 'navy', label: 'ネイビー', swatch: '#1e3a8a' },
  { id: 'violet', label: 'バイオレット', swatch: '#7c3aed' },
  { id: 'orange', label: 'オレンジ', swatch: '#ea580c' },
  { id: 'brown', label: 'ブラウン', swatch: '#92400e' },
  { id: 'pink', label: 'ピンク', swatch: '#db2777' },
  { id: 'gold', label: 'ゴールド', swatch: '#ca8a04' },
  { id: 'black', label: 'ブラック', swatch: '#171717' },
  { id: 'gray', label: 'グレー', swatch: '#525252' },
];

const VALID_THEMES = new Set<string>(MC_UI_ACCENT_THEME_OPTIONS.map((o) => o.id));

export function readMcUiAccentTheme(): McUiAccentTheme {
  if (typeof window === 'undefined') return 'green';
  try {
    const v = window.localStorage.getItem(MC_UI_ACCENT_THEME_STORAGE_KEY);
    if (v && VALID_THEMES.has(v)) return v as McUiAccentTheme;
    return 'green';
  } catch {
    return 'green';
  }
}

export function writeMcUiAccentTheme(theme: McUiAccentTheme): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MC_UI_ACCENT_THEME_STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent(MC_UI_ACCENT_THEME_UPDATED_EVENT, { detail: { theme } }));
  } catch {
    // noop
  }
}

/** html[data-mc-accent-theme] を同期（green は既定のため属性を外す） */
export function applyMcUiAccentThemeToDocument(theme: McUiAccentTheme): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (theme === 'green') {
    el.removeAttribute('data-mc-accent-theme');
  } else {
    el.setAttribute('data-mc-accent-theme', theme);
  }
}
