/**
 * 発言欄の YouTube キーワード検索・検索結果モーダル・候補リスト連携をまとめてオフにする。
 * `NEXT_PUBLIC_YOUTUBE_KEYWORD_SEARCH_DISABLED=1` で無効（未設定・0 なら従来どおり有効）。
 */
export function isYoutubeKeywordSearchEnabled(): boolean {
  return process.env.NEXT_PUBLIC_YOUTUBE_KEYWORD_SEARCH_DISABLED !== '1';
}
