import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { isAdminSongJapaneseDomesticDisplay } from '@/lib/song-catalog-scope';
import { ensureWesternTreatedJpArtistCache } from '@/lib/western-treated-jp-artists';

export const dynamic = 'force-dynamic';

export type AdminSongSearchItem = {
  id: string;
  display_title: string | null;
  main_artist: string | null;
  song_title: string | null;
  song_title_ja: string | null;
  style: string | null;
  play_count: number | null;
  original_release_date: string | null;
  is_japanese_domestic: boolean;
  catalog_scope: string | null;
  spotify_track_id: string | null;
  spotify_popularity: number | null;
};

function sortAdminSongSearchItems(items: AdminSongSearchItem[]): AdminSongSearchItem[] {
  return [...items].sort((a, b) => {
    const da = (a.original_release_date ?? '').trim();
    const db = (b.original_release_date ?? '').trim();
    if (!da && !db) {
      return (a.display_title ?? a.song_title ?? '').localeCompare(
        b.display_title ?? b.song_title ?? '',
        'ja',
      );
    }
    if (!da) return 1;
    if (!db) return -1;
    const byDate = db.localeCompare(da);
    if (byDate !== 0) return byDate;
    return (a.display_title ?? a.song_title ?? '').localeCompare(
      b.display_title ?? b.song_title ?? '',
      'ja',
    );
  });
}

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

  await ensureWesternTreatedJpArtistCache();

  let data: unknown[] | null = null;
  let error: { message: string; code?: string } | null = null;
  const primary = await supabase
    .from('songs')
    .select(
      'id, display_title, main_artist, song_title, song_title_ja, style, play_count, catalog_scope, original_release_date, spotify_track_id, spotify_popularity',
    )
    .or(
      [
        `display_title.ilike.${like}`,
        `main_artist.ilike.${like}`,
        `song_title.ilike.${like}`,
        `song_title_ja.ilike.${like}`,
      ].join(','),
    )
    .limit(100);
  if (primary.error?.code === '42703') {
    const fallback = await supabase
      .from('songs')
      .select(
        'id, display_title, main_artist, song_title, style, play_count, catalog_scope, original_release_date, spotify_track_id, spotify_popularity',
      )
      .or(
        [
          `display_title.ilike.${like}`,
          `main_artist.ilike.${like}`,
          `song_title.ilike.${like}`,
        ].join(','),
      )
      .limit(100);
    if (fallback.error?.code === '42703') {
      const legacy = await supabase
        .from('songs')
        .select('id, display_title, main_artist, song_title, style, play_count, original_release_date')
        .or(
          [
            `display_title.ilike.${like}`,
            `main_artist.ilike.${like}`,
            `song_title.ilike.${like}`,
          ].join(','),
        )
        .limit(100);
      data = legacy.data;
      error = legacy.error;
    } else {
      data = fallback.data;
      error = fallback.error;
    }
  } else {
    data = primary.data;
    error = primary.error;
  }

  if (error) {
    console.error('[admin/songs-search]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items: AdminSongSearchItem[] = (data ?? []).map((row) => {
    const r = row as {
      id: string;
      display_title: string | null;
      main_artist: string | null;
      song_title: string | null;
      song_title_ja?: string | null;
      style: string | null;
      play_count: number | null;
      catalog_scope?: string | null;
      original_release_date?: string | null;
      spotify_track_id?: string | null;
      spotify_popularity?: number | null;
    };
    const pop = r.spotify_popularity;
    return {
      id: r.id,
      display_title: r.display_title,
      main_artist: r.main_artist,
      song_title: r.song_title,
      song_title_ja: typeof r.song_title_ja === 'string' ? r.song_title_ja : null,
      style: r.style,
      play_count: r.play_count,
      original_release_date:
        typeof r.original_release_date === 'string' ? r.original_release_date : null,
      catalog_scope: typeof r.catalog_scope === 'string' ? r.catalog_scope : null,
      spotify_track_id:
        typeof r.spotify_track_id === 'string' && r.spotify_track_id.trim()
          ? r.spotify_track_id.trim()
          : null,
      spotify_popularity:
        pop != null && Number.isFinite(Number(pop)) ? Math.round(Number(pop)) : null,
      is_japanese_domestic: isAdminSongJapaneseDomesticDisplay({
        catalog_scope: r.catalog_scope ?? null,
        main_artist: r.main_artist,
        song_title: r.song_title,
        display_title: r.display_title,
      }),
    };
  });

  return NextResponse.json({ items: sortAdminSongSearchItems(items) });
}

