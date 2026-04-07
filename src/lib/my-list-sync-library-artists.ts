import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCommaSeparatedArtists } from '@/lib/my-list-youtube-title-suggest';

const DISPLAY_NAME_MAX = 500;
const ARTIST_SLUG_MAX = 200;

function buildArtistSlugForMusic8(displayName: string): string | null {
  let s = displayName.trim();
  if (!s) return null;
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/^the\s+/i, '');
  s = s.toLowerCase();
  s = s.replace(/&/g, ' and ');
  s = s.replace(/['’]/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!s) return null;
  return s.slice(0, ARTIST_SLUG_MAX);
}

async function getOrCreateLibraryArtistId(
  supabase: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<{ id: string | null; missingTable: boolean }> {
  const name = displayName.trim().slice(0, DISPLAY_NAME_MAX);
  const slug = buildArtistSlugForMusic8(name);
  if (!name) return { id: null, missingTable: false };

  const { data: existingWithSlug, error: selWithSlugErr } = await supabase
    .from('user_my_library_artists')
    .select('id, artist_slug')
    .eq('user_id', userId)
    .eq('display_name', name)
    .maybeSingle();
  const needsOldSelect = selWithSlugErr?.code === '42703';
  const { data: existing, error: selErr } = needsOldSelect
    ? await supabase
        .from('user_my_library_artists')
        .select('id')
        .eq('user_id', userId)
        .eq('display_name', name)
        .maybeSingle()
    : { data: existingWithSlug, error: selWithSlugErr };

  if (selErr?.code === '42P01') return { id: null, missingTable: true };
  if (selErr) {
    console.error('[my-list-sync-artists] select artist', selErr);
    return { id: null, missingTable: false };
  }
  if (existing?.id) {
    if (!needsOldSelect && slug && !(existing as { artist_slug?: string | null }).artist_slug) {
      const { error: upErr } = await supabase
        .from('user_my_library_artists')
        .update({ artist_slug: slug })
        .eq('id', existing.id)
        .eq('user_id', userId);
      if (upErr && upErr.code !== '42703') {
        console.error('[my-list-sync-artists] update artist slug', upErr);
      }
    }
    return { id: existing.id, missingTable: false };
  }

  const { data: ins, error: insErr } = await supabase
    .from('user_my_library_artists')
    .insert({ user_id: userId, display_name: name, artist_slug: slug })
    .select('id')
    .single();
  const finalInsErr =
    insErr?.code === '42703'
      ? (
          await supabase
            .from('user_my_library_artists')
            .insert({ user_id: userId, display_name: name })
            .select('id')
            .single()
        ).error
      : insErr;
  const finalInsData =
    insErr?.code === '42703'
      ? (
          await supabase
            .from('user_my_library_artists')
            .select('id')
            .eq('user_id', userId)
            .eq('display_name', name)
            .maybeSingle()
        ).data
      : ins;

  if (finalInsErr?.code === '42P01') return { id: null, missingTable: true };
  if (finalInsErr?.code === '23505') {
    const { data: again } = await supabase
      .from('user_my_library_artists')
      .select('id')
      .eq('user_id', userId)
      .eq('display_name', name)
      .maybeSingle();
    return { id: again?.id ?? null, missingTable: false };
  }
  if (finalInsErr) {
    console.error('[my-list-sync-artists] insert artist', finalInsErr);
    return { id: null, missingTable: false };
  }
  return { id: finalInsData?.id ?? null, missingTable: false };
}

/**
 * `user_my_list_items.artist` の文字列（カンマ区切り可）を
 * `user_my_library_artists` / `user_my_list_item_artists` に反映する。
 * テーブル未作成時は何もせず終了（本番レスポンスは成功のまま）。
 */
export async function syncMyListItemLibraryArtists(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  artistBlob: string | null,
): Promise<void> {
  const names = parseCommaSeparatedArtists(artistBlob ?? '');
  const artistIds: string[] = [];

  for (const raw of names) {
    const { id, missingTable } = await getOrCreateLibraryArtistId(supabase, userId, raw);
    if (missingTable) {
      return;
    }
    if (id) artistIds.push(id);
  }

  const { error: delErr } = await supabase
    .from('user_my_list_item_artists')
    .delete()
    .eq('my_list_item_id', itemId);

  if (delErr?.code === '42P01') {
    return;
  }
  if (delErr) {
    console.error('[my-list-sync-artists] delete links', delErr);
    return;
  }

  for (let i = 0; i < artistIds.length; i++) {
    const { error: linkErr } = await supabase.from('user_my_list_item_artists').insert({
      my_list_item_id: itemId,
      artist_id: artistIds[i],
      position: i,
    });
    if (linkErr?.code === '42P01') {
      return;
    }
    if (linkErr) {
      console.error('[my-list-sync-artists] insert link', linkErr);
      return;
    }
  }
}
