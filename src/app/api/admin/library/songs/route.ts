import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { songRowLooksJapaneseDomesticForAdminLibrary } from '@/lib/admin-library-jp-exclude';
import {
  compareLibraryReleaseSort,
  resolveLibraryOriginalReleaseDate,
} from '@/lib/library-release-sort-date';
import { fetchSongsForLibraryArtistSelection } from '@/lib/library-search-query';
import { ensureWesternTreatedJpArtistCache } from '@/lib/western-treated-jp-artists';
import { fetchSongIdsWithAiCommentary } from '@/lib/library-ai-commentary-presence';
import { rankLibraryVideoVariant } from '@/lib/library-video-variant-rank';

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
  /** 曲に song_tidbits.ai_commentary があるか */
  has_ai_commentary: boolean;
};

function parseSort(raw: string | null): 'release_new' | 'release_old' | 'spotify_popularity' {
  if (raw === 'release_old') return 'release_old';
  if (raw === 'spotify_popularity') return 'spotify_popularity';
  return 'release_new';
}

/**
 * GET: 指定アーティストの曲一覧（代表 `video_id` 付き）
 * Query: artist（必須）, sort=release_new|release_old|spotify_popularity
 * 曲の取得は部屋ライブラリと同じ（The / 冠詞ゆれ・共演を含む）。
 * 公開日は Music8 アルバム日を優先。
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

  const SONG_SELECT =
    'id, display_title, main_artist, song_title, style, play_count, spotify_popularity, original_release_date, music8_song_data';

  let songRows: {
    id: string;
    display_title: string | null;
    main_artist: string | null;
    song_title: string | null;
    style: string | null;
    play_count: number | null;
    spotify_popularity: number | null;
    original_release_date: string | null;
    music8_song_data?: unknown;
  }[];

  try {
    songRows = await fetchSongsForLibraryArtistSelection(
      supabase,
      artist,
      SONG_SELECT,
      500,
      'indexed_pick',
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : '曲一覧の取得に失敗しました。';
    console.error('[admin/library/songs] songs', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const songs = songRows.filter((s) => !songRowLooksJapaneseDomesticForAdminLibrary(s));
  const ids = songs.map((s) => s.id).filter(Boolean);
  const videoBySong = new Map<string, string>();
  const ytPublishedBySong = new Map<string, string | null>();
  const videoIdsBySongId = new Map<string, string[]>();

  if (ids.length > 0) {
    const { data: vidRows, error: vidErr } = await supabase
      .from('song_videos')
      .select('song_id, video_id, variant, created_at, youtube_published_at')
      .in('song_id', ids)
      .order('created_at', { ascending: true });

    if (vidErr && vidErr.code !== '42P01') {
      console.error('[admin/library/songs] song_videos', vidErr);
    } else if (Array.isArray(vidRows)) {
      const rankedBySong = new Map<
        string,
        { videoId: string; rank: number; youtubePublishedAt: string | null }
      >();
      for (const r of vidRows as {
        song_id: string;
        video_id: string;
        variant?: string | null;
        youtube_published_at?: string | null;
      }[]) {
        if (!r.song_id || !r.video_id) continue;
        const list = videoIdsBySongId.get(r.song_id) ?? [];
        list.push(r.video_id);
        videoIdsBySongId.set(r.song_id, list);
        const nextRank = rankLibraryVideoVariant(r.variant);
        const yt =
          typeof r.youtube_published_at === 'string' && r.youtube_published_at.trim()
            ? r.youtube_published_at.trim()
            : null;
        if (yt && !ytPublishedBySong.has(r.song_id)) {
          ytPublishedBySong.set(r.song_id, yt);
        }
        const cur = rankedBySong.get(r.song_id);
        if (!cur || nextRank < cur.rank) {
          rankedBySong.set(r.song_id, {
            videoId: r.video_id,
            rank: nextRank,
            youtubePublishedAt: yt,
          });
        }
      }
      for (const [songId, picked] of rankedBySong) {
        videoBySong.set(songId, picked.videoId);
        if (picked.youtubePublishedAt) {
          ytPublishedBySong.set(songId, picked.youtubePublishedAt);
        }
      }
    }
  }

  let commentarySongIds = new Set<string>();
  try {
    commentarySongIds = await fetchSongIdsWithAiCommentary(supabase, ids, videoIdsBySongId);
  } catch (e) {
    console.error('[admin/library/songs] ai_commentary presence', e);
  }

  const items: AdminLibrarySongItem[] = songs.map((s) => {
    const videoId = videoBySong.get(s.id) ?? null;
    const preferredOriginal = resolveLibraryOriginalReleaseDate({
      originalReleaseDate: s.original_release_date,
      music8SongData: s.music8_song_data,
    });
    return {
      id: s.id,
      display_title: s.display_title,
      main_artist: s.main_artist,
      song_title: s.song_title,
      style: s.style,
      play_count: s.play_count,
      spotify_popularity: s.spotify_popularity,
      original_release_date: preferredOriginal,
      video_id: videoId,
      youtube_published_at: ytPublishedBySong.get(s.id) ?? null,
      has_ai_commentary: commentarySongIds.has(s.id),
    };
  });

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
