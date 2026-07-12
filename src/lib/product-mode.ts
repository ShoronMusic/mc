/**
 * ma（musicaichat / musicai.jp）と mc（musicchat / musicchat.jp）のプロダクト切替。
 * NEXT_PUBLIC_PRODUCT 未設定時は ma（後方互換）。
 */
export const PRODUCT_MA = 'musicaichat' as const;
export const PRODUCT_MC = 'musicchat' as const;

export type ProductId = typeof PRODUCT_MA | typeof PRODUCT_MC;

export function getProductId(): ProductId {
  const raw = process.env.NEXT_PUBLIC_PRODUCT?.trim().toLowerCase();
  if (raw === PRODUCT_MC) return PRODUCT_MC;
  return PRODUCT_MA;
}

export function isMcProduct(): boolean {
  return getProductId() === PRODUCT_MC;
}

export function isMaProduct(): boolean {
  return !isMcProduct();
}

/**
 * mc デプロイでは Gemini を一切呼ばない（`getGeminiModel` が常に null）。
 * 視聴履歴の style/era 推定・`/api/ai/*` ブロックと合わせて AI 原価ゼロ。
 */
export function isMcGeminiDisabled(): boolean {
  return isMcProduct();
}

/** mc デプロイで拒否するパス（API は JSON 404、ページは 404 テキスト） */
export function isMcBlockedPath(pathname: string): boolean {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return true;
  if (pathname.startsWith('/api/ai/')) return true;
  if (pathname === '/api/ai-question-guard-objection') return true;
  if (pathname === '/api/tidbit-moderator-check') return true;
  if (pathname === '/api/ai-chat-tuning-report') return true;
  if (pathname === '/api/next-song-recommend-feedback') return true;
  if (pathname === '/api/comment-feedback') return true;

  const blockedUserApi = [
    '/api/user/ai-trial',
    '/api/user/ai-taste-summary',
    '/api/user/ai-taste-auto-profile',
    '/api/user/ai-taste-auto-refresh',
    '/api/user/gemini-usage-summary',
    '/api/user/at-question-history',
    '/api/user/room-ai-features',
  ] as const;

  if (blockedUserApi.includes(pathname as (typeof blockedUserApi)[number])) return true;
  if (pathname === '/api/user/theme-playlist-mission/room-blurb') return true;

  return false;
}

export function getProductTheme(): 'light' | 'dark' {
  return isMcProduct() ? 'light' : 'dark';
}
