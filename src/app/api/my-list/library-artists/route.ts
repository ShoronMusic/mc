import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export type MyListLibraryArtistItem = {
  id: string;
  title: string | null;
  artist: string | null;
  video_id: string;
  url: string;
  position: number;
  created_at: string;
};

export type MyListLibraryArtistRow = {
  id: string;
  display_name: string;
  artist_slug: string | null;
  linked_count: number;
  items: MyListLibraryArtistItem[];
};

function firstEmbed<T extends Record<string, unknown>>(embed: unknown): T | null {
  if (embed == null) return null;
  if (Array.isArray(embed)) {
    const x = embed[0];
    return x && typeof x === 'object' ? (x as T) : null;
  }
  return typeof embed === 'object' ? (embed as T) : null;
}

/**
 * GET: マイライブラリに保存済みのアーティスト一覧と、各アーティストに紐づくマイリスト曲。
 * `user_my_library_artists` / `user_my_list_item_artists` 未作成時は空配列。
 */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  const uid = session.user.id;

  const { data: artistRowsWithSlug, error: aErrWithSlug } = await supabase
    .from('user_my_library_artists')
    .select('id, display_name, artist_slug')
    .eq('user_id', uid)
    .order('display_name');
  const fallbackOldSelect = aErrWithSlug?.code === '42703';
  const { data: artistRows, error: aErr } = fallbackOldSelect
    ? await supabase
        .from('user_my_library_artists')
        .select('id, display_name')
        .eq('user_id', uid)
        .order('display_name')
    : { data: artistRowsWithSlug, error: aErrWithSlug };

  if (aErr?.code === '42P01') {
    return NextResponse.json({ artists: [] as MyListLibraryArtistRow[] });
  }
  if (aErr) {
    console.error('[my-list/library-artists] artists', aErr);
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }

  const { data: linkRows, error: lErr } = await supabase
    .from('user_my_list_item_artists')
    .select('artist_id, position, user_my_list_items(id, title, artist, video_id, url, created_at)');

  const byArtist = new Map<string, MyListLibraryArtistItem[]>();

  if (!lErr && linkRows) {
    for (const row of linkRows as {
      artist_id: string;
      position: number;
      user_my_list_items: unknown;
    }[]) {
      const raw = firstEmbed<{
        id: string;
        title: string | null;
        artist: string | null;
        video_id: string;
        url: string;
        created_at: string;
      }>(row.user_my_list_items);
      if (!raw?.id) continue;
      const it: MyListLibraryArtistItem = {
        id: raw.id,
        title: raw.title,
        artist: raw.artist,
        video_id: raw.video_id,
        url: raw.url,
        position: row.position,
        created_at: raw.created_at ?? '',
      };
      const list = byArtist.get(row.artist_id) ?? [];
      list.push(it);
      byArtist.set(row.artist_id, list);
    }
  } else if (lErr && lErr.code !== '42P01') {
    console.error('[my-list/library-artists] links', lErr);
  }

  const artists: MyListLibraryArtistRow[] = (artistRows ?? []).map((a) => {
    const items = [...(byArtist.get(a.id) ?? [])];
    items.sort((x, y) => {
      if (x.position !== y.position) return x.position - y.position;
      return x.created_at.localeCompare(y.created_at);
    });
    return {
      id: a.id,
      display_name: a.display_name,
      artist_slug: fallbackOldSelect ? null : ((a as { artist_slug?: string | null }).artist_slug ?? null),
      linked_count: items.length,
      items,
    };
  });

  artists.sort((a, b) => a.display_name.localeCompare(b.display_name, 'ja'));

  return NextResponse.json({ artists });
}
