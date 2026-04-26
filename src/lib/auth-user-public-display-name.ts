import type { User } from '@supabase/supabase-js';

/**
 * 会の主催者など、公開してよい範囲の「表示名」候補を auth.user_metadata から拾う。
 * メール等は返さない。
 */
export function displayNameFromAuthUserMetadata(user: User | null | undefined): string | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const candidates: unknown[] = [
    meta.display_name,
    meta.full_name,
    meta.name,
    meta.preferred_username,
    meta.user_name,
  ];
  for (const c of candidates) {
    if (typeof c === 'string') {
      const t = c.trim();
      if (t) return t.length > 48 ? `${t.slice(0, 48)}…` : t;
    }
  }
  return null;
}
