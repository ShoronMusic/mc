import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { fetchMyPlayCountByVideoIds } from '@/lib/library-my-play-count';
import { fetchSongsForLibraryArtistSelection } from '@/lib/library-search-query';
import { compareLibraryReleaseSort } from '@/lib/library-release-sort-date';
import {
  defaultLibraryCatalogFilter,
  filterSongRowsByLibraryCatalog,
  parseLibraryCatalogFilter,
} from '@/lib/song-catalog-scope';
import { ensureWesternTreatedJpArtistCache } from '@/lib/western-treated-jp-artists';

export const dynamic = 'force-dynamic';

export type LibrarySongByArtistItem = {
  id: string;
  display_title: string | null;
  main_artist: string | null;
  song_title: string | null;
  style: string | null;
  genres: string | null;
  vocal: string | null;
  play_count: number | null;
  my_play_count: number | null;
  original_release_date: string | null;
  /** 代表 video の YouTube 公開日（原盤日が無いときの新旧ソート用） */
  youtube_published_at: string | null;
  spotify_popularity: number | null;
  video_id: string | null;
};

function parseSort(raw: string | null): 'release' | 'plays' | 'popularity' {
  if (raw === 'plays') return 'plays';
  if (raw === 'popularity' || raw === 'spotify_popularity') return 'popularity';
  return 'release';
}

function rankVariant(variant: string | null | undefined): number {
  const v = (variant ?? '').trim().toLowerCase();
  if (v === 'official') return 0;
  if (v === 'topic') return 1;
  if (v === 'lyric') return 2;
  if (v === 'live') return 3;
  if (v) return 4;
  return 5;
}

/**
 * GET: 指定 `main_artist` の曲一覧（代表 video は `/api/library/search` と同様に variant 優先）。
 * Query: artist（必須）, sort=release|plays|popularity
 */
export async function GET(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const artist = (searchParams.get('artist') ?? '').trim();
  if (!artist) {
    return NextResponse.json({ error: 'artist query is required' }, { status: 400 });
  }

  const sort = parseSort(searchParams.get('sort'));
  const catalog = parseLibraryCatalogFilter(searchParams.get('catalog'), defaultLibraryCatalogFilter());

  await ensureWesternTreatedJpArtistCache(admin);

  const SONG_SELECT =
    'id, display_title, main_artist, song_title, style, genres, vocal, play_count, original_release_date, spotify_popularity, catalog_scope, music8_artist_slug, primary_artist_name_ja';

  let songsRaw: {
    id: string;
    display_title: string | null;
    main_artist: string | null;
    song_title: string | null;
    style: string | null;
    genres: string[] | string | null;
    vocal: string | null;
    play_count: number | null;
    original_release_date: string | null;
    spotify_popularity: number | null;
  }[];

  try {
    songsRaw = await fetchSongsForLibraryArtistSelection(admin, artist, SONG_SELECT, 500, 'indexed_pick');
  } catch (songErr) {
    const msg = songErr instanceof Error ? songErr.message : '曲一覧の取得に失敗しました。';
    console.error('[api/library/songs-by-artist] songs', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const songs = filterSongRowsByLibraryCatalog(songsRaw, catalog);
  const ids = songs.map((s) => s.id).filter(Boolean);
  const videoBySong = new Map<string, string>();
  const ytPublishedBySong = new Map<string, string | null>();
  const songIdByVideo = new Map<string, string>();

  if (ids.length > 0) {
    const { data: vidRows, error: vidErr } = await admin
      .from('song_videos')
      .select('song_id, video_id, variant, created_at, youtube_published_at')
      .in('song_id', ids)
      .order('created_at', { ascending: true });

    if (vidErr && vidErr.code !== '42P01') {
      console.error('[api/library/songs-by-artist] song_videos', vidErr);
    } else if (Array.isArray(vidRows)) {
      const rankedBySong = new Map<
        string,
        { videoId: string; rank: number; youtubePublishedAt: string | null }
      >();
      for (const row of vidRows as {
        song_id: string;
        video_id: string;
        variant?: string | null;
        youtube_published_at?: string | null;
      }[]) {
        if (!row.song_id || !row.video_id) continue;
        if (!songIdByVideo.has(row.video_id)) songIdByVideo.set(row.video_id, row.song_id);
        const nextRank = rankVariant(row.variant);
        const yt =
          typeof row.youtube_published_at === 'string' && row.youtube_published_at.trim()
            ? row.youtube_published_at.trim()
            : null;
        const cur = rankedBySong.get(row.song_id);
        if (!cur || nextRank < cur.rank) {
          rankedBySong.set(row.song_id, {
            videoId: row.video_id,
            rank: nextRank,
            youtubePublishedAt: yt,
          });
        }
      }
      for (const [songId, picked] of rankedBySong) {
        videoBySong.set(songId, picked.videoId);
        ytPublishedBySong.set(songId, picked.youtubePublishedAt);
      }
    }
  }

  let myPlayBySong = new Map<string, number>();
  try {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      const videoIds = Array.from(songIdByVideo.keys());
      if (uid && videoIds.length > 0) {
        const myPlayByVideo = await fetchMyPlayCountByVideoIds(admin, uid, videoIds);
        for (const [vid, c] of myPlayByVideo.entries()) {
          const sid = songIdByVideo.get(vid);
          if (!sid) continue;
          myPlayBySong.set(sid, c);
        }
      }
    }
  } catch (e) {
    console.error('[api/library/songs-by-artist] my_play_count exception', e);
  }

  const items: LibrarySongByArtistItem[] = songs.map((s) => ({
    id: s.id,
    display_title: s.display_title,
    main_artist: s.main_artist,
    song_title: s.song_title,
    style: s.style,
    genres: Array.isArray(s.genres)
      ? s.genres.join(', ')
      : typeof s.genres === 'string'
        ? s.genres
        : null,
    vocal: s.vocal,
    play_count: s.play_count,
    my_play_count: myPlayBySong.get(s.id) ?? null,
    original_release_date: s.original_release_date,
    youtube_published_at: ytPublishedBySong.get(s.id) ?? null,
    spotify_popularity:
      typeof s.spotify_popularity === 'number' && Number.isFinite(s.spotify_popularity)
        ? s.spotify_popularity
        : null,
    video_id: videoBySong.get(s.id) ?? null,
  }));

  items.sort((a, b) => {
    if (sort === 'popularity') {
      const pa = a.spotify_popularity ?? -1;
      const pb = b.spotify_popularity ?? -1;
      if (pb !== pa) return pb - pa;
    } else if (sort === 'plays') {
      const pa = a.play_count ?? 0;
      const pb = b.play_count ?? 0;
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
        'desc',
      );
      if (c !== 0) return c;
    }
    const ta = (a.display_title ?? a.song_title ?? '').trim();
    const tb = (b.display_title ?? b.song_title ?? '').trim();
    return ta.localeCompare(tb, 'en', { sensitivity: 'base' });
  });

  return NextResponse.json({ items, sort, catalog });
}
