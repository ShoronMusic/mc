/**
 * Supabase クライアント（チャンク）を待たずに、ブラウザ内の既存セッション有無を読む。
 * トップの主催メニューが「準備中」のまま webpack チャンク待ちで固まらないようにする。
 */

const AUTH_TOKEN_COOKIE_RE = /(?:^|;\s*)[^=]*-auth-token(?:\.\d+)?=/i;

export function hasSupabaseAuthTokenInCookieHeader(cookieHeader: string): boolean {
  return AUTH_TOKEN_COOKIE_RE.test(cookieHeader);
}

export function hasSupabaseAuthTokenInStorageKeys(keys: readonly string[]): boolean {
  return keys.some((key) => /(?:^|[-_])auth-token(?:\.\d+)?$/i.test(key) || /^sb-.*auth-token/i.test(key));
}

/** クライアントのみ。cookie / localStorage にセッションらしきキーがあれば true。 */
export function peekBrowserAuthLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (hasSupabaseAuthTokenInCookieHeader(document.cookie)) return true;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key) keys.push(key);
    }
    return hasSupabaseAuthTokenInStorageKeys(keys);
  } catch {
    return false;
  }
}
