import { isYouTubeConfigured } from '@/lib/youtube-search';

/**
 * 発言欄の YouTube キーワード検索・検索結果モーダル・候補リスト連携。
 * 既定はオフ（本番で env 未設定でも検索 UI を出さない）。
 * - 有効にする: `NEXT_PUBLIC_YOUTUBE_KEYWORD_SEARCH_ENABLED=1`
 * - 旧方式（無効を明示）: `NEXT_PUBLIC_YOUTUBE_KEYWORD_SEARCH_DISABLED=1` は引き続き最優先でオフ
 * - 後方互換: `NEXT_PUBLIC_YOUTUBE_KEYWORD_SEARCH_DISABLED=0` のときはオン扱い
 */
export function isYoutubeKeywordSearchEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_YOUTUBE_KEYWORD_SEARCH_DISABLED === '1') return false;
  if (process.env.NEXT_PUBLIC_YOUTUBE_KEYWORD_SEARCH_DISABLED === '0') return true;
  return process.env.NEXT_PUBLIC_YOUTUBE_KEYWORD_SEARCH_ENABLED === '1';
}

/**
 * AIキャラ選曲など、サーバーだけで YouTube Data API に解決する経路。
 * 発言欄のキーワード検索 UI（上記）がオフでも、`YOUTUBE_API_KEY` があれば true。
 * 明示オフ: `YOUTUBE_AI_CHARACTER_RESOLVE_DISABLED=1`
 */
export function isYoutubeAiCharacterServerResolveEnabled(): boolean {
  if (process.env.YOUTUBE_AI_CHARACTER_RESOLVE_DISABLED === '1') return false;
  return isYouTubeConfigured();
}
