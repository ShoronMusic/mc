/**
 * comment-pack / commentary リクエストから特集 AI 無料を解決する。
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveFeaturedPageAiUsageFree } from '@/lib/featured-pages';

export async function resolvePromoAiFreeFromRequestBody(body: {
  featuredPageId?: unknown;
  featuredArtistName?: unknown;
}): Promise<boolean> {
  const featuredPageId =
    typeof body?.featuredPageId === 'string' ? body.featuredPageId.trim() : '';
  const featuredArtistName =
    typeof body?.featuredArtistName === 'string' ? body.featuredArtistName.trim() : '';
  if (!featuredPageId || !featuredArtistName) return false;

  const admin = createAdminClient();
  if (!admin) return false;

  const resolved = await resolveFeaturedPageAiUsageFree({
    admin,
    featuredPageId,
    artistName: featuredArtistName,
  });
  return resolved.ok;
}
