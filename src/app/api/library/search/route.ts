import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  expandLibrarySearchQueryVariants,
  escapeLikeForIlike,
  fetchSongsForLibraryArtistSelection,
  resolveMainArtistsForLibrarySearch,
} from '@/lib/library-search-query';
import { songRowLooksJapaneseDomesticForAdminLibrary } from '@/lib/admin-library-jp-exclude';

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
  spotify_popularity: number | null;
  video_id: string | null;
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
};

const SONG_SELECT =
  'id, display_title, song_title, main_artist, style, genres, vocal, play_count, original_release_date, spotify_popularity, primary_artist_name_ja';

function clampLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(100, n));
}

async function fetchSongsByTextVariants(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  variants: string[],
  perVariantLimit: number,
): Promise<SongRow[]> {
  const byId = new Map<string, SongRow>();
  for (const v of variants) {
    const escaped = escapeLikeForIlike(v);
    const orFilter = [
      `main_artist.ilike.%${escaped}%`,
      `song_title.ilike.%${escaped}%`,
      `display_title.ilike.%${escaped}%`,
      `primary_artist_name_ja.ilike.%${escaped}%`,
    ].join(',');
    const { data, error } = await admin.from('songs').select(SONG_SELECT).or(orFilter).limit(perVariantLimit);
    if (error) {
      if (error.code === '42703') {
        const { data: fallback } = await admin
          .from('songs')
          .select(
            'id, display_title, song_title, main_artist, style, genres, vocal, play_count, original_release_date, spotify_popularity',
          )
          .or(
            [
              `main_artist.ilike.%${escaped}%`,
              `song_title.ilike.%${escaped}%`,
              `display_title.ilike.%${escaped}%`,
            ].join(','),
          )
          .limit(perVariantLimit);
        for (const row of (fallback ?? []) as SongRow[]) {
          if (!songRowLooksJapaneseDomesticForAdminLibrary(row)) byId.set(row.id, row);
        }
        continue;
      }
      console.warn('[api/library/search] songs variant', v, error.message);
      continue;
    }
    for (const row of (data ?? []) as SongRow[]) {
      if (!songRowLooksJapaneseDomesticForAdminLibrary(row)) byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

async function fetchSongsByMainArtists(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  mainArtists: string[],
  limit: number,
): Promise<SongRow[]> {
  const byId = new Map<string, SongRow>();
  for (const name of mainArtists) {
    try {
      const rows = await fetchSongsForLibraryArtistSelection<SongRow>(admin, name, SONG_SELECT, limit);
      for (const row of rows) {
        if (!songRowLooksJapaneseDomesticForAdminLibrary(row)) byId.set(row.id, row);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[api/library/search] songs by artist', name, msg);
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

export async function GET(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const limit = clampLimit(url.searchParams.get('limit'));

  let songs: SongRow[] = [];

  if (q) {
    const variants = expandLibrarySearchQueryVariants(q);
    const mainArtistsFromTable = await resolveMainArtistsForLibrarySearch(admin, q);
    const perVariant = Math.min(limit, 80);
    const fromText = await fetchSongsByTextVariants(admin, variants, perVariant);
    const fromArtists =
      mainArtistsFromTable.length > 0
        ? await fetchSongsByMainArtists(admin, mainArtistsFromTable, perVariant)
        : [];
    const merged = new Map<string, SongRow>();
    for (const row of [...fromText, ...fromArtists]) merged.set(row.id, row);
    songs = sortSongRows([...merged.values()]).slice(0, limit);
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
    songs = ((songRows ?? []) as SongRow[]).filter((r) => !songRowLooksJapaneseDomesticForAdminLibrary(r));
  }

  const ids = songs.map((s) => s.id).filter(Boolean);
  const videoBySong = new Map<string, string>();
  const songIdByVideo = new Map<string, string>();

  if (ids.length > 0) {
    const { data: videoRows, error: videoErr } = await admin
      .from('song_videos')
      .select('song_id, video_id, variant, created_at')
      .in('song_id', ids)
      .order('created_at', { ascending: true });
    if (videoErr && videoErr.code !== '42P01') {
      console.error('[api/library/search] song_videos', videoErr);
    } else if (Array.isArray(videoRows)) {
      const rank = (variant: string | null | undefined): number => {
        const v = (variant ?? '').trim().toLowerCase();
        if (v === 'official') return 0;
        if (v === 'topic') return 1;
        if (v === 'lyric') return 2;
        if (v === 'live') return 3;
        if (v) return 4;
        return 5;
      };
      const rankedBySong = new Map<string, { videoId: string; rank: number }>();
      for (const row of videoRows as { song_id: string; video_id: string; variant?: string | null }[]) {
        if (!row.song_id || !row.video_id) continue;
        if (!songIdByVideo.has(row.video_id)) songIdByVideo.set(row.video_id, row.song_id);
        const nextRank = rank(row.variant);
        const cur = rankedBySong.get(row.song_id);
        if (!cur || nextRank < cur.rank) {
          rankedBySong.set(row.song_id, { videoId: row.video_id, rank: nextRank });
        }
      }
      for (const [songId, picked] of rankedBySong) {
        videoBySong.set(songId, picked.videoId);
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

  const items: LibrarySongItem[] = songs.map((s) => ({
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
    original_release_date: s.original_release_date,
    spotify_popularity:
      typeof s.spotify_popularity === 'number' && Number.isFinite(s.spotify_popularity)
        ? s.spotify_popularity
        : null,
    video_id: videoBySong.get(s.id) ?? null,
  }));

  return NextResponse.json({
    items,
    query: q,
    limit,
  });
}
