/**
 * 自分の発言のテキストカラー用。
 * 黒背景で見やすい32色（暗い色は含めない）。localStorage で仮保存。
 */

export const CHAT_TEXT_COLOR_STORAGE_KEY = 'mc:chat_text_color';
export const DEFAULT_CHAT_TEXT_COLOR = '#ffffff';

/** 発言欄（黒背景）で見やすい32色。暗い色は含まない */
export const CHAT_TEXT_COLOR_PALETTE: string[] = [
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
