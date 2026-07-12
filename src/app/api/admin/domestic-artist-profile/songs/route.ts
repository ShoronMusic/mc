import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { fetchSongsForLibraryArtistSelection } from '@/lib/library-search-query';
import { compareLibraryReleaseSort } from '@/lib/library-release-sort-date';
import {
  filterSongRowsByLibraryCatalog,
  parseLibraryCatalogFilter,
} from '@/lib/song-catalog-scope';
import { ensureWesternTreatedJpArtistCache } from '@/lib/western-treated-jp-artists';

export const dynamic = 'force-dynamic';

export type DomesticArtistRegisteredSongItem = {
  id: string;
  display_title: string | null;
  main_artist: string | null;
  song_title: string | null;
  song_title_ja: string | null;
  original_release_date: string | null;
  youtube_published_at: string | null;
  video_id: string | null;
  youtube_url: string | null;
  spotify_track_id: string | null;
  spotify_popularity: number | null;
};

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
 * GET: 邦楽アーティスト編集用 — 登録済み曲一覧（代表 YouTube 付き）。
 * Query: name（必須・artists.name / main_artist）, catalog=domestic|all（既定 domestic）
 */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const name = (searchParams.get('name') ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'name が必要です。' }, { status: 400 });
  }

  const catalog = parseLibraryCatalogFilter(searchParams.get('catalog'), 'domestic');
  await ensureWesternTreatedJpArtistCache(admin);

  const SONG_SELECT =
    'id, display_title, main_artist, song_title, song_title_ja, original_release_date, catalog_scope, music8_artist_slug, primary_artist_name_ja, spotify_track_id, spotify_popularity';
  const SONG_SELECT_FALLBACK =
    'id, display_title, main_artist, song_title, original_release_date, catalog_scope, music8_artist_slug, primary_artist_name_ja, spotify_track_id, spotify_popularity';

  let songsRaw: Array<{
    id: string;
    display_title: string | null;
    main_artist: string | null;
    song_title: string | null;
    song_title_ja?: string | null;
    original_release_date: string | null;
    spotify_track_id?: string | null;
    spotify_popularity?: number | null;
  }>;

  try {
    songsRaw = await fetchSongsForLibraryArtistSelection(
      admin,
      name,
      SONG_SELECT,
      500,
      'indexed_pick',
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('42703') || /song_title_ja/i.test(msg)) {
      try {
        songsRaw = await fetchSongsForLibraryArtistSelection(
          admin,
          name,
          SONG_SELECT_FALLBACK,
          500,
          'indexed_pick',
        );
      } catch (retryErr) {
        const m = retryErr instanceof Error ? retryErr.message : '曲一覧の取得に失敗しました。';
        console.error('[admin/domestic-artist-profile/songs]', m);
        return NextResponse.json({ error: m }, { status: 500 });
      }
    } else {
      console.error('[admin/domestic-artist-profile/songs]', msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const songs = filterSongRowsByLibraryCatalog(songsRaw, catalog);
  const ids = songs.map((s) => s.id).filter(Boolean);
  const videoBySong = new Map<string, string>();
  const ytPublishedBySong = new Map<string, string | null>();

  if (ids.length > 0) {
    const { data: vidRows, error: vidErr } = await admin
      .from('song_videos')
      .select('song_id, video_id, variant, created_at, youtube_published_at')
      .in('song_id', ids)
      .order('created_at', { ascending: true });

    if (vidErr && vidErr.code !== '42P01') {
      console.error('[admin/domestic-artist-profile/songs] song_videos', vidErr);
    } else if (Array.isArray(vidRows)) {
      const ranked = new Map<
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
        const nextRank = rankVariant(row.variant);
        const yt =
          typeof row.youtube_published_at === 'string' && row.youtube_published_at.trim()
            ? row.youtube_published_at.trim()
            : null;
        const cur = ranked.get(row.song_id);
        if (!cur || nextRank < cur.rank) {
          ranked.set(row.song_id, { videoId: row.video_id, rank: nextRank, youtubePublishedAt: yt });
        }
      }
      for (const [songId, picked] of ranked) {
        videoBySong.set(songId, picked.videoId);
        ytPublishedBySong.set(songId, picked.youtubePublishedAt);
      }
    }
  }

  const items: DomesticArtistRegisteredSongItem[] = songs.map((s) => {
    const videoId = videoBySong.get(s.id) ?? null;
    const pop = s.spotify_popularity;
    return {
      id: s.id,
      display_title: s.display_title,
      main_artist: s.main_artist,
      song_title: s.song_title,
      song_title_ja: typeof s.song_title_ja === 'string' ? s.song_title_ja : null,
      original_release_date: s.original_release_date,
      youtube_published_at: ytPublishedBySong.get(s.id) ?? null,
      video_id: videoId,
      youtube_url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
      spotify_track_id:
        typeof s.spotify_track_id === 'string' && s.spotify_track_id.trim()
          ? s.spotify_track_id.trim()
          : null,
      spotify_popularity:
        pop != null && Number.isFinite(Number(pop)) ? Math.round(Number(pop)) : null,
    };
  });

  items.sort((a, b) => {
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
    return (a.song_title ?? a.display_title ?? '').localeCompare(
      b.song_title ?? b.display_title ?? '',
      'ja',
    );
  });

  return NextResponse.json({ items, count: items.length, artistName: name, catalog });
}
