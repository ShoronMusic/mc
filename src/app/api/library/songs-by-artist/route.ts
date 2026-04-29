import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { songRowLooksJapaneseDomesticForAdminLibrary } from '@/lib/admin-library-jp-exclude';

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
  video_id: string | null;
};

function parseSort(raw: string | null): 'release' | 'plays' {
  return raw === 'plays' ? 'plays' : 'release';
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
 * Query: artist（必須）, sort=release|plays
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

  const { data: songRows, error: songErr } = await admin
    .from('songs')
    .select(
      'id, display_title, main_artist, song_title, style, genres, vocal, play_count, original_release_date',
    )
    .eq('main_artist', artist);

  if (songErr) {
    console.error('[api/library/songs-by-artist] songs', songErr);
    return NextResponse.json({ error: songErr.message }, { status: 500 });
  }

  const songsRaw = (songRows ?? []) as {
    id: string;
    display_title: string | null;
    main_artist: string | null;
    song_title: string | null;
    style: string | null;
    genres: string[] | string | null;
    vocal: string | null;
    play_count: number | null;
    original_release_date: string | null;
  }[];

  const songs = songsRaw.filter((s) => !songRowLooksJapaneseDomesticForAdminLibrary(s));
  const ids = songs.map((s) => s.id).filter(Boolean);
  const videoBySong = new Map<string, string>();
  const songIdByVideo = new Map<string, string>();

  if (ids.length > 0) {
    const { data: vidRows, error: vidErr } = await admin
      .from('song_videos')
      .select('song_id, video_id, variant, created_at')
      .in('song_id', ids)
      .order('created_at', { ascending: true });

    if (vidErr && vidErr.code !== '42P01') {
      console.error('[api/library/songs-by-artist] song_videos', vidErr);
    } else if (Array.isArray(vidRows)) {
      const rankedBySong = new Map<string, { videoId: string; rank: number }>();
      for (const row of vidRows as { song_id: string; video_id: string; variant?: string | null }[]) {
        if (!row.song_id || !row.video_id) continue;
        if (!songIdByVideo.has(row.video_id)) songIdByVideo.set(row.video_id, row.song_id);
        const nextRank = rankVariant(row.variant);
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
              console.error('[api/library/songs-by-artist] room_playback_history', error);
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
    video_id: videoBySong.get(s.id) ?? null,
  }));

  const nullsLast = (v: string | null | undefined) => (v == null || v === '' ? null : v);

  items.sort((a, b) => {
    if (sort === 'plays') {
      const pa = a.play_count ?? 0;
      const pb = b.play_count ?? 0;
      if (pb !== pa) return pb - pa;
    } else {
      const da = nullsLast(a.original_release_date);
      const db = nullsLast(b.original_release_date);
      if (da && db) {
        const c = db.localeCompare(da);
        if (c !== 0) return c;
      } else if (db && !da) return 1;
      else if (da && !db) return -1;
    }
    const ta = (a.display_title ?? a.song_title ?? '').trim();
    const tb = (b.display_title ?? b.song_title ?? '').trim();
    return ta.localeCompare(tb, 'en', { sensitivity: 'base' });
  });

  return NextResponse.json({ items, sort });
}
