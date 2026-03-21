import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (!q) {
    return NextResponse.json({ items: [] });
  }

  // like 検索用に % と _ をエスケープ
  const escaped = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
  const like = `%${escaped}%`;

  const { data, error } = await supabase
    .from('songs')
    .select('id, display_title, main_artist, song_title, style, play_count')
    .or(
      [
        `display_title.ilike.${like}`,
        `main_artist.ilike.${like}`,
        `song_title.ilike.${like}`,
      ].join(',')
    )
    .order('display_title', { ascending: true })
    .limit(100);

  if (error) {
    console.error('[admin/songs-search]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

