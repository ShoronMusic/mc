import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCommaSeparatedArtists } from '@/lib/my-list-youtube-title-suggest';

const DISPLAY_NAME_MAX = 500;

async function getOrCreateLibraryArtistId(
  supabase: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<{ id: string | null; missingTable: boolean }> {
  const name = displayName.trim().slice(0, DISPLAY_NAME_MAX);
  if (!name) return { id: null, missingTable: false };

  const { data: existing, error: selErr } = await supabase
    .from('user_my_library_artists')
    .select('id')
    .eq('user_id', userId)
    .eq('display_name', name)
    .maybeSingle();

  if (selErr?.code === '42P01') return { id: null, missingTable: true };
  if (selErr) {
    console.error('[my-list-sync-artists] select artist', selErr);
    return { id: null, missingTable: false };
  }
  if (existing?.id) return { id: existing.id, missingTable: false };

  const { data: ins, error: insErr } = await supabase
    .from('user_my_library_artists')
    .insert({ user_id: userId, display_name: name })
    .select('id')
    .single();

  if (insErr?.code === '42P01') return { id: null, missingTable: true };
  if (insErr?.code === '23505') {
    const { data: again } = await supabase
      .from('user_my_library_artists')
      .select('id')
      .eq('user_id', userId)
      .eq('display_name', name)
      .maybeSingle();
    return { id: again?.id ?? null, missingTable: false };
  }
  if (insErr) {
    console.error('[my-list-sync-artists] insert artist', insErr);
    return { id: null, missingTable: false };
  }
  return { id: ins?.id ?? null, missingTable: false };
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
