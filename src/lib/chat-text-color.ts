/**
 * 自分の発言のテキストカラー用。
 * MA: 暗背景向けの明色パレット。MC: 白背景向けの濃色パレット（既定は黒）。
 * localStorage で保存。
 */

import { IS_MC_PRODUCT } from '@/lib/product-branding';

export const CHAT_TEXT_COLOR_STORAGE_KEY = 'mc:chat_text_color';

/** MA（暗背景）の既定 */
export const DEFAULT_MA_CHAT_TEXT_COLOR = '#ffffff';

/** MC（白背景）の既定 */
export const DEFAULT_MC_CHAT_TEXT_COLOR = '#000000';

/** @deprecated defaultChatTextColor() を利用 */
export const DEFAULT_CHAT_TEXT_COLOR = DEFAULT_MA_CHAT_TEXT_COLOR;

/** mc 白背景上の参加者名（発言色パレットとは別） */
export const MC_TEXT_ON_LIGHT_SURFACE = '#1f2937';

export function defaultChatTextColor(): string {
  return IS_MC_PRODUCT ? DEFAULT_MC_CHAT_TEXT_COLOR : DEFAULT_MA_CHAT_TEXT_COLOR;
}

/** 暗背景（ma）では参加者色。mc 白背景では読める濃色に固定 */
export function participantChatColorForSurface(
  color: string | undefined | null,
  darkFallback = '#e5e7eb',
): string {
  if (!IS_MC_PRODUCT) {
    return color?.trim() || darkFallback;
  }
  return MC_TEXT_ON_LIGHT_SURFACE;
}

export function shouldApplyParticipantChatColorInline(): boolean {
  return true;
}

/** 参加者表示名の照合（空白差・接頭一致） */
export function normalizeParticipantDisplayNameKey(name: string): string {
  return name.trim().replace(/\s+/g, '');
}

export function participantDisplayNamesMatch(a: string, b: string): boolean {
  const ka = normalizeParticipantDisplayNameKey(a);
  const kb = normalizeParticipantDisplayNameKey(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.startsWith(kb) || kb.startsWith(ka);
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** 明るい色か（白背景で薄く見える／ラベル内文字の白抜き判定） */
export function isLightHexColor(hex: string): boolean {
  const rgb = parseHexRgb(hex);
  if (!rgb) return false;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.65;
}

/** ラベル BG 上の文字色（基本は白、明色 BG のときだけ濃色） */
export function labelTextOnBackground(bgHex: string): string {
  return isLightHexColor(bgHex) ? MC_TEXT_ON_LIGHT_SURFACE : '#ffffff';
}

/** localStorage から読み込んだ色を正規化（MC の旧明色は黒に寄せる） */
export function normalizeSavedChatTextColor(saved: string | null | undefined): string {
  if (!saved || !/^#[0-9a-fA-F]{6}$/.test(saved)) return defaultChatTextColor();
  if (!IS_MC_PRODUCT) return saved;
  if (isLightHexColor(saved)) return DEFAULT_MC_CHAT_TEXT_COLOR;
  return saved;
}

/** mc 選曲アナウンス用 */
export function mcParticipantSpeechColorForAnnounce(
  color: string | undefined | null,
): string {
  return normalizeSavedChatTextColor(color?.trim() ?? null);
}

/** MA: 発言欄（黒背景）で見やすい明色。暗い色は含めない */
export const MA_CHAT_TEXT_COLOR_PALETTE: string[] = [
  '#ffffff', // 白
  '#e5e5e5', // ライトグレー
  '#fef08a', // 薄黄
  '#fde047',
  '#facc15', // 黄
  '#fbbf24',
  '#fb923c', // オレンジ
  '#f97316',
  '#f87171', // 赤系
  '#f472b6', // ピンク
  '#e879f9', // 紫系
  '#c084fc',
  '#a78bfa',
  '#818cf8', // 青紫
  '#6366f1',
  '#60a5fa', // 青
  '#38bdf8',
  '#22d3ee', // シアン
  '#2dd4bf',
  '#34d399', // 緑
  '#4ade80',
  '#84cc16', // 黄緑
  '#a3e635',
  '#bef264',
  '#fcd34d', // ゴールド系
  '#fde68a',
  '#fed7aa', // 桃
  '#fecaca',
  '#fbcfe8', // ピンク薄
  '#e9d5ff',
  '#ddd6fe',
];

/** MC: 白背景チャットで読める濃色（既定は先頭の黒） */
export const MC_CHAT_TEXT_COLOR_PALETTE: string[] = [
  '#000000', // 黒（既定）
  '#1f2937',
  '#374151',
  '#4b5563',
  '#6b7280',
  '#991b1b',
  '#b91c1c',
  '#dc2626',
  '#c2410c',
  '#ea580c',
  '#d97706',
  '#b45309',
  '#a16207',
  '#854d0e',
  '#365314',
  '#4d7c0f',
  '#15803d',
  '#047857',
  '#0f766e',
  '#0e7490',
  '#0369a1',
  '#1d4ed8',
  '#1e40af',
  '#3730a3',
  '#4338ca',
  '#5b21b6',
  '#6d28d9',
  '#7e22ce',
  '#a21caf',
  '#be185d',
  '#9f1239',
  '#9a3412',
];

/** @deprecated chatTextColorPalette() を利用 */
export const CHAT_TEXT_COLOR_PALETTE = MA_CHAT_TEXT_COLOR_PALETTE;

export function chatTextColorPalette(): string[] {
  return IS_MC_PRODUCT ? MC_CHAT_TEXT_COLOR_PALETTE : MA_CHAT_TEXT_COLOR_PALETTE;
}

/** カラースウォッチの枠線（暗色は視認用） */
export function chatTextColorSwatchBorder(hex: string, selected: boolean): string {
  if (selected) return '#60a5fa';
  return isLightHexColor(hex) ? '#9ca3af' : '#4b5563';
}
