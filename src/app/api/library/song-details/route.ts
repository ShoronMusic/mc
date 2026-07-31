import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { fetchSongIdsWithAiCommentary } from '@/lib/library-ai-commentary-presence';
import { fetchMyPlayCountByVideoIds } from '@/lib/library-my-play-count';

export const dynamic = 'force-dynamic';

const MAX_SONG_IDS = 500;
const SONG_ID_CHUNK = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SongDetailItem = {
  id: string;
  my_play_count: number | null;
  has_ai_commentary: boolean;
};

/**
 * POST: ライブラリ一覧の非必須情報を後から返す。
 * Body: { songIds: string[] }（最大500件）
 */
export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const rawSongIds: unknown[] = Array.isArray(body?.songIds) ? body.songIds : [];
  const songIds: string[] = [
    ...new Set(
      rawSongIds
        .filter((id: unknown): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter((id) => UUID_PATTERN.test(id)),
    ),
  ].slice(0, MAX_SONG_IDS);

  if (songIds.length === 0) {
    return NextResponse.json({ items: [] as SongDetailItem[] });
  }

  // 認証確認は song_videos と独立しているので先に並行開始する。
  const userIdPromise = (async (): Promise<string | null> => {
    try {
      const supabase = await createClient();
      if (!supabase) return null;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user?.id ?? null;
    } catch {
      return null;
    }
  })();

  const videoIdsBySongId = new Map<string, string[]>();
  const songIdByVideo = new Map<string, string>();
  for (let i = 0; i < songIds.length; i += SONG_ID_CHUNK) {
    const chunk = songIds.slice(i, i + SONG_ID_CHUNK);
    const { data: videoRows, error: videoError } = await admin
      .from('song_videos')
      .select('song_id, video_id')
      .in('song_id', chunk);

    if (videoError) {
      if (videoError.code !== '42P01') {
        console.error('[api/library/song-details] song_videos', videoError);
      }
      break;
    }
    for (const row of (videoRows ?? []) as { song_id?: string; video_id?: string }[]) {
      const songId = row.song_id?.trim() ?? '';
      const videoId = row.video_id?.trim() ?? '';
      if (!songId || !videoId) continue;
      const list = videoIdsBySongId.get(songId) ?? [];
      list.push(videoId);
      videoIdsBySongId.set(songId, list);
      if (!songIdByVideo.has(videoId)) songIdByVideo.set(videoId, songId);
    }
  }

  const commentaryPromise = fetchSongIdsWithAiCommentary(
    admin,
    songIds,
    videoIdsBySongId,
  ).catch((error) => {
    console.error('[api/library/song-details] ai_commentary presence', error);
    return new Set<string>();
  });

  const myPlayPromise = (async () => {
    const userId = await userIdPromise;
    const bySong = new Map<string, number>();
    if (!userId || songIdByVideo.size === 0) return bySong;
    try {
      const byVideo = await fetchMyPlayCountByVideoIds(
        admin,
        userId,
        [...songIdByVideo.keys()],
      );
      for (const [videoId, count] of byVideo) {
        const songId = songIdByVideo.get(videoId);
        if (!songId) continue;
        bySong.set(songId, (bySong.get(songId) ?? 0) + count);
      }
    } catch (error) {
      console.error('[api/library/song-details] my_play_count', error);
    }
    return bySong;
  })();

  const [commentarySongIds, myPlayBySong] = await Promise.all([
    commentaryPromise,
    myPlayPromise,
  ]);

  const items: SongDetailItem[] = songIds.map((id) => ({
    id,
    my_play_count: myPlayBySong.get(id) ?? null,
    has_ai_commentary: commentarySongIds.has(id),
  }));

  const response = NextResponse.json({ items });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
