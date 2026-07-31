import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  expandLibrarySearchQueryVariants,
  escapeLikeForIlike,
  fetchSongsForLibraryArtistSelection,
  resolveMainArtistsForLibrarySearch,
  dedupeLibraryArtistDisplayNames,
  resolveLibrarySearchPriorityArtistNames,
  songMainArtistIncludesArtist,
  fetchCreditSongsForLibraryArtistNamesBatch,
  mapWithLimitedConcurrency,
  LIBRARY_SEARCH_ARTIST_CONCURRENCY,
  LIBRARY_SEARCH_QUERY_CONCURRENCY,
} from '@/lib/library-search-query';
import {
  defaultLibraryCatalogFilter,
  filterSongRowsByLibraryCatalog,
  parseLibraryCatalogFilter,
} from '@/lib/song-catalog-scope';
import { ensureWesternTreatedJpArtistCache } from '@/lib/western-treated-jp-artists';
import { fetchSongIdsWithAiCommentary } from '@/lib/library-ai-commentary-presence';
import { rankLibraryVideoVariant } from '@/lib/library-video-variant-rank';
import { resolveLibraryOriginalReleaseDate } from '@/lib/library-release-sort-date';

export const dynamic = 'force-dynamic';

type LibrarySongItem = {
  id: string;
  title: string;
  song_title: string | null;
  main_artist: string | null;
  style: string | null;
  genres: string | null;
  vocal: string | null;
  play_count: number | null;
  my_play_count: number | null;
  original_release_date: string | null;
  youtube_published_at: string | null;
  spotify_popularity: number | null;
  video_id: string | null;
  has_ai_commentary: boolean;
};

type SongRow = {
  id: string;
  display_title: string | null;
  song_title: string | null;
  main_artist: string | null;
  style: string | null;
  genres: string[] | string | null;
  vocal: string | null;
  play_count: number | null;
  original_release_date: string | null;
  spotify_popularity: number | null;
  catalog_scope?: string | null;
  music8_artist_slug?: string | null;
  primary_artist_name_ja?: string | null;
  music8_song_data?: unknown;
};

const SONG_SELECT =
  'id, display_title, song_title, main_artist, style, genres, vocal, play_count, original_release_date, spotify_popularity, primary_artist_name_ja, catalog_scope, music8_artist_slug, music8_song_data';

const SONG_SELECT_FALLBACK =
  'id, display_title, song_title, main_artist, style, genres, vocal, play_count, original_release_date, spotify_popularity, primary_artist_name_ja, music8_song_data';

function clampLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(100, n));
}

async function fetchSongsByTextVariants(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  variants: string[],
  perVariantLimit: number,
  catalog: ReturnType<typeof parseLibraryCatalogFilter>,
): Promise<SongRow[]> {
  const perVariantRows = await mapWithLimitedConcurrency(
    variants,
    LIBRARY_SEARCH_QUERY_CONCURRENCY,
    async (v): Promise<SongRow[]> => {
      const escaped = escapeLikeForIlike(v);
      const orFilter = [
        `main_artist.ilike.%${escaped}%`,
        `song_title.ilike.%${escaped}%`,
        `display_title.ilike.%${escaped}%`,
        `primary_artist_name_ja.ilike.%${escaped}%`,
        `song_title_ja.ilike.%${escaped}%`,
      ].join(',');
      const { data, error } = await admin.from('songs').select(SONG_SELECT).or(orFilter).limit(perVariantLimit);
      if (error?.code === '42703') {
        const fallback = await admin
          .from('songs')
          .select(SONG_SELECT_FALLBACK)
          .or(
            [
              `main_artist.ilike.%${escaped}%`,
              `song_title.ilike.%${escaped}%`,
              `display_title.ilike.%${escaped}%`,
            ].join(','),
          )
          .limit(perVariantLimit);
        if (fallback.error) {
          console.warn('[api/library/search] songs variant fallback', v, fallback.error.message);
          return [];
        }
        return (fallback.data ?? []) as SongRow[];
      }
      if (error) {
        console.warn('[api/library/search] songs variant', v, error.message);
        return [];
      }
      return (data ?? []) as SongRow[];
    },
  );

  const byId = new Map<string, SongRow>();
  for (const rows of perVariantRows) {
    for (const row of filterSongRowsByLibraryCatalog(rows, catalog)) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

/**
 * `song_credits` 経由の曲をアーティスト名まとめて先に引く。
 * 失敗しても致命ではないので、その場合は空 Map（＝各アーティストが従来の単体経路を使う）。
 */
async function prefetchCreditSongsByArtist(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  mainArtists: string[],
  limit: number,
): Promise<Map<string, SongRow[]>> {
  // 一括化を切り戻すための保険（`LIBRARY_SEARCH_CREDIT_BATCH=0` で従来の 1 名ずつに戻る）
  if (process.env.LIBRARY_SEARCH_CREDIT_BATCH === '0') return new Map();
  for (const select of [SONG_SELECT, SONG_SELECT_FALLBACK]) {
    try {
      return await fetchCreditSongsForLibraryArtistNamesBatch<SongRow>(admin, mainArtists, select, limit);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[api/library/search] credit songs batch', select === SONG_SELECT ? 'primary' : 'fallback', msg);
    }
  }
  return new Map();
}

async function fetchSongsByMainArtists(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  mainArtists: string[],
  limit: number,
  catalog: ReturnType<typeof parseLibraryCatalogFilter>,
): Promise<SongRow[]> {
  const creditSongsByArtist = await prefetchCreditSongsByArtist(admin, mainArtists, limit);

  // 1 アーティストあたり複数クエリが走るため、アーティスト側の同時実行数は控えめにする。
  const perArtistRows = await mapWithLimitedConcurrency(
    mainArtists,
    LIBRARY_SEARCH_ARTIST_CONCURRENCY,
    async (name): Promise<SongRow[]> => {
      const creditSongs = creditSongsByArtist.get(name.trim()) ?? null;
      try {
        return await fetchSongsForLibraryArtistSelection<SongRow>(
          admin,
          name,
          SONG_SELECT,
          limit,
          'search_broad',
          creditSongs,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[api/library/search] songs by artist', name, msg);
        try {
          return await fetchSongsForLibraryArtistSelection<SongRow>(
            admin,
            name,
            SONG_SELECT_FALLBACK,
            limit,
            'search_broad',
            creditSongs,
          );
        } catch (retryErr) {
          console.warn('[api/library/search] songs by artist fallback', name, retryErr);
          return [];
        }
      }
    },
  );

  const byId = new Map<string, SongRow>();
  for (const rows of perArtistRows) {
    for (const row of filterSongRowsByLibraryCatalog(rows, catalog)) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

function sortSongRows(rows: SongRow[]): SongRow[] {
  return [...rows].sort((a, b) => {
    const pa = a.play_count ?? 0;
    const pb = b.play_count ?? 0;
    if (pb !== pa) return pb - pa;
    const ta = (a.display_title ?? a.song_title ?? '').trim();
    const tb = (b.display_title ?? b.song_title ?? '').trim();
    return ta.localeCompare(tb, 'en', { sensitivity: 'base' });
  });
}

/** 日本語略称ヒット時は同名英語バンドを先頭に（スミス→The Smiths 等） */
function prioritizeLibrarySearchSongs(rows: SongRow[], priorityArtists: string[]): SongRow[] {
  if (priorityArtists.length === 0) return sortSongRows(rows);
  const prioritized: SongRow[] = [];
  const others: SongRow[] = [];
  for (const row of rows) {
    if (priorityArtists.some((a) => songMainArtistIncludesArtist(row.main_artist, a))) {
      prioritized.push(row);
    } else {
      others.push(row);
    }
  }
  return [...sortSongRows(prioritized), ...sortSongRows(others)];
}

export async function GET(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const limit = clampLimit(url.searchParams.get('limit'));
  const catalog = parseLibraryCatalogFilter(url.searchParams.get('catalog'), defaultLibraryCatalogFilter());
  const deferDetails = url.searchParams.get('deferDetails') === '1';

  await ensureWesternTreatedJpArtistCache(admin);

  let songs: SongRow[] = [];

  if (q) {
    const variants = expandLibrarySearchQueryVariants(q);
    const perVariant = Math.min(limit, 80);
    // 曲のテキスト検索は artists 側の解決結果に依存しないので並行に走らせる。
    const [mainArtistsFromTable, fromText] = await Promise.all([
      resolveMainArtistsForLibrarySearch(admin, q),
      fetchSongsByTextVariants(admin, variants, perVariant, catalog),
    ]);
    const priorityArtists = dedupeLibraryArtistDisplayNames([
      ...mainArtistsFromTable,
      ...resolveLibrarySearchPriorityArtistNames(q),
    ]);
    const fromArtists =
      priorityArtists.length > 0
        ? await fetchSongsByMainArtists(admin, priorityArtists, perVariant, catalog)
        : [];
    const merged = new Map<string, SongRow>();
    for (const row of [...fromText, ...fromArtists]) merged.set(row.id, row);
    songs = prioritizeLibrarySearchSongs([...merged.values()], priorityArtists).slice(0, limit);
  } else {
    const { data: songRows, error: songErr } = await admin
      .from('songs')
      .select(SONG_SELECT)
      .order('play_count', { ascending: false, nullsFirst: false })
      .order('original_release_date', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (songErr) {
      console.error('[api/library/search] songs', songErr);
      return NextResponse.json({ error: '曲一覧の取得に失敗しました。' }, { status: 500 });
    }
    songs = filterSongRowsByLibraryCatalog((songRows ?? []) as SongRow[], catalog);
  }

  const ids = songs.map((s) => s.id).filter(Boolean);
  const videoBySong = new Map<string, string>();
  const ytPublishedBySong = new Map<string, string | null>();
  const songIdByVideo = new Map<string, string>();
  const videoIdsBySongId = new Map<string, string[]>();

  if (ids.length > 0) {
    const { data: videoRows, error: videoErr } = await admin
      .from('song_videos')
      .select('song_id, video_id, variant, created_at, youtube_published_at')
      .in('song_id', ids)
      .order('created_at', { ascending: true });
    if (videoErr && videoErr.code !== '42P01') {
      console.error('[api/library/search] song_videos', videoErr);
    } else if (Array.isArray(videoRows)) {
      const rankedBySong = new Map<
        string,
        { videoId: string; rank: number; youtubePublishedAt: string | null }
      >();
      for (const row of videoRows as {
        song_id: string;
        video_id: string;
        variant?: string | null;
        youtube_published_at?: string | null;
      }[]) {
        if (!row.song_id || !row.video_id) continue;
        if (!songIdByVideo.has(row.video_id)) songIdByVideo.set(row.video_id, row.song_id);
        const list = videoIdsBySongId.get(row.song_id) ?? [];
        list.push(row.video_id);
        videoIdsBySongId.set(row.song_id, list);
        const nextRank = rankLibraryVideoVariant(row.variant);
        const yt =
          typeof row.youtube_published_at === 'string' && row.youtube_published_at.trim()
            ? row.youtube_published_at.trim()
            : null;
        if (yt && !ytPublishedBySong.has(row.song_id)) {
          ytPublishedBySong.set(row.song_id, yt);
        }
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
        if (picked.youtubePublishedAt) {
          ytPublishedBySong.set(songId, picked.youtubePublishedAt);
        }
      }
    }
  }

  let myPlayBySong = new Map<string, number>();
  if (!deferDetails) {
    try {
      const supabase = await createClient();
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const uid = user?.id ?? null;
        const videoIds = Array.from(songIdByVideo.keys());
        if (uid && videoIds.length > 0) {
          const PAGE = 1000;
          const MAX_SCAN = 12000;
          let scanned = 0;
          const myPlayByVideo = new Map<string, number>();
          for (let offset = 0; ; offset += PAGE) {
            const { data: rows, error } = await admin
              .from('room_playback_history')
              .select('video_id')
              .eq('user_id', uid)
              .in('video_id', videoIds)
              .range(offset, offset + PAGE - 1);
            if (error) {
              if (error.code !== '42P01') {
                console.error('[api/library/search] my_play_count room_playback_history', error);
              }
              break;
            }
            const batch = (rows ?? []) as { video_id?: string }[];
            for (const r of batch) {
              const vid = typeof r.video_id === 'string' ? r.video_id : '';
              if (!vid) continue;
              myPlayByVideo.set(vid, (myPlayByVideo.get(vid) ?? 0) + 1);
            }
            scanned += batch.length;
            if (batch.length < PAGE) break;
            if (scanned >= MAX_SCAN) break;
          }
          for (const [vid, c] of myPlayByVideo.entries()) {
            const sid = songIdByVideo.get(vid);
            if (!sid) continue;
            myPlayBySong.set(sid, (myPlayBySong.get(sid) ?? 0) + c);
          }
        }
      }
    } catch (e) {
      console.error('[api/library/search] my_play_count exception', e);
    }
  }

  let commentarySongIds = new Set<string>();
  if (!deferDetails) {
    try {
      commentarySongIds = await fetchSongIdsWithAiCommentary(admin, ids, videoIdsBySongId);
    } catch (e) {
      console.error('[api/library/search] ai_commentary presence', e);
    }
  }

  const items: LibrarySongItem[] = songs.map((s) => {
    const videoId = videoBySong.get(s.id) ?? null;
    const preferredOriginal = resolveLibraryOriginalReleaseDate({
      originalReleaseDate: s.original_release_date,
      music8SongData: s.music8_song_data,
    });
    return {
      id: s.id,
      title: (s.display_title ?? s.song_title ?? '').trim() || '（タイトル不明）',
      song_title: s.song_title,
      main_artist: s.main_artist,
      style: s.style,
      genres: Array.isArray(s.genres)
        ? s.genres.join(', ')
        : typeof s.genres === 'string'
          ? s.genres
          : null,
      vocal: s.vocal,
      play_count: s.play_count,
      my_play_count: myPlayBySong.get(s.id) ?? null,
      original_release_date: preferredOriginal,
      youtube_published_at: ytPublishedBySong.get(s.id) ?? null,
      spotify_popularity:
        typeof s.spotify_popularity === 'number' && Number.isFinite(s.spotify_popularity)
          ? s.spotify_popularity
          : null,
      video_id: videoId,
      has_ai_commentary: commentarySongIds.has(s.id),
    };
  });

  return NextResponse.json({
    items,
    query: q,
    limit,
    catalog,
    details_deferred: deferDetails,
  });
}
