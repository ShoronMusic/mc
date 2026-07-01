import type { User } from '@supabase/supabase-js';
import { getBrowserAppOrigin } from '@/lib/app-origin';

/** OAuth 等のリダイレクト先パス（先頭 `/` 必須） */
export function safeAuthNextPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '/';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';
  return trimmed;
}

/** メール確認リンクの `emailRedirectTo`（`/auth/callback` 経由で部屋等へ戻す） */
export function buildEmailConfirmRedirectUrl(nextPath?: string, originOverride?: string): string {
  const origin = originOverride ?? getBrowserAppOrigin();
  const next = safeAuthNextPath(nextPath);
  if (!origin) return `/auth/callback?next=${encodeURIComponent(next)}&flow=email_confirm`;
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}&flow=email_confirm`;
}

export function isUserEmailConfirmed(user: User | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.email_confirmed_at);
}

/** メール＋パスワード登録ユーザー（Google 等 OAuth 併用は除外） */
export function isEmailPasswordUser(user: User): boolean {
  const providers = user.identities?.map((i) => i.provider) ?? [];
  if (providers.length === 0) {
    return user.app_metadata?.provider === 'email';
  }
  const hasEmail = providers.includes('email');
  const hasOAuth = providers.some((p) => p !== 'email');
  return hasEmail && !hasOAuth;
}

/** Confirm email ON 時、メール登録ユーザーは確認完了までログイン・付与対象外 */
export function requiresEmailConfirmation(user: User | null | undefined): boolean {
  if (!user || isUserEmailConfirmed(user)) return false;
  return isEmailPasswordUser(user);
}
