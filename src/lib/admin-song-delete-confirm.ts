/**
 * 曲マスタ削除の確認入力照合用（大文字小文字・引用符・ダッシュの揺れを吸収）
 */
export function normalizeSongDeleteConfirmText(raw: string): string {
  return raw
    .trim()
    .normalize('NFC')
    .replace(/[\u2018\u2019\u2032\u00b4]/g, "'") // ’ ' ′ ´
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-') // – —
    .toLowerCase();
}
