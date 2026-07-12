import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { songRowLooksJapaneseDomesticForAdminLibrary } from '@/lib/admin-library-jp-exclude';
import { compareLibraryReleaseSort } from '@/lib/library-release-sort-date';
import { ensureWesternTreatedJpArtistCache } from '@/lib/western-treated-jp-artists';

export const dynamic = 'force-dynamic';

export type AdminLibrarySongItem = {
  id: string;
  display_title: string | null;
  main_artist: string | null;
  song_title: string | null;
  style: string | null;
  play_count: number | null;
  spotify_popularity: number | null;
  original_release_date: string | null;
  youtube_published_at: string | null;
  video_id: string | null;
};

function parseSort(raw: string | null): 'release_new' | 'release_old' | 'spotify_popularity' {
  if (raw === 'release_old') return 'release_old';
  if (raw === 'spotify_popularity') return 'spotify_popularity';
  return 'release_new';
}

/**
 * GET: 指定 `main_artist` の曲一覧（代表 `video_id` 付き）
 * Query: artist（必須・main_artist と完全一致）, sort=release_new|release_old|spotify_popularity
 * 邦楽寄り行は返さない（管理ライブラリは洋楽寄せ）。
 */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  const { searchParams } = new URL(request.url);
  const artist = (searchParams.get('artist') ?? '').trim();
  if (!artist) {
    return NextResponse.json({ error: 'artist query is required' }, { status: 400 });
  }

  await ensureWesternTreatedJpArtistCache();

  const sort = parseSort(searchParams.get('sort'));

  const { data: songRows, error: songErr } = await supabase
    .from('songs')
    .select(
      'id, display_title, main_artist, song_title, style, play_count, spotify_popularity, original_release_date',
    )
    .eq('main_artist', artist);

  if (songErr) {
    console.error('[admin/library/songs] songs', songErr);
    return NextResponse.json({ error: songErr.message }, { status: 500 });
  }

  const songs = (
    (songRows ?? []) as Omit<AdminLibrarySongItem, 'video_id' | 'youtube_published_at'>[]
  ).filter((s) => !songRowLooksJapaneseDomesticForAdminLibrary(s));
  const ids = songs.map((s) => s.id).filter(Boolean);
  const videoBySong = new Map<string, string>();
  const ytPublishedBySong = new Map<string, string | null>();

  if (ids.length > 0) {
    const { data: vidRows, error: vidErr } = await supabase
      .from('song_videos')
      .select('song_id, video_id, created_at, youtube_published_at')
      .in('song_id', ids)
      .order('created_at', { ascending: true });

    if (vidErr && vidErr.code !== '42P01') {
      console.error('[admin/library/songs] song_videos', vidErr);
    } else if (Array.isArray(vidRows)) {
      for (const r of vidRows as {
        song_id: string;
        video_id: string;
        youtube_published_at?: string | null;
      }[]) {
        if (r.song_id && r.video_id && !videoBySong.has(r.song_id)) {
          videoBySong.set(r.song_id, r.video_id);
          ytPublishedBySong.set(
            r.song_id,
            typeof r.youtube_published_at === 'string' && r.youtube_published_at.trim()
              ? r.youtube_published_at.trim()
              : null,
          );
        }
      }
    }
  }

  const items: AdminLibrarySongItem[] = songs.map((s) => ({
    ...s,
    video_id: videoBySong.get(s.id) ?? null,
    youtube_published_at: ytPublishedBySong.get(s.id) ?? null,
  }));

  items.sort((a, b) => {
    if (sort === 'spotify_popularity') {
      const pa = a.spotify_popularity ?? -1;
      const pb = b.spotify_popularity ?? -1;
      if (pb !== pa) return pb - pa;
    } else {
      const c = compareLibraryReleaseSort(
        {
          originalReleaseDate: a.original_release_date,
          youtubePublishedAt: a.youtube_published_at,
        },
        {
          originalReleaseDate: b.original_release_date,
          youtubePublishedAt: b.youtube_published_at,
        },
        sort === 'release_old' ? 'asc' : 'desc',
      );
      if (c !== 0) return c;
    }
    const ta = (a.display_title ?? a.song_title ?? '').trim();
    const tb = (b.display_title ?? b.song_title ?? '').trim();
    return ta.localeCompare(tb, 'en', { sensitivity: 'base' });
  });

  return NextResponse.json({ items, sort });
}
