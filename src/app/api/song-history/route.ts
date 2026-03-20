import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchOEmbed } from '@/lib/youtube-oembed';

export const dynamic = 'force-dynamic';

/**
 * ログイン中のユーザーがチャットで貼った曲を履歴に保存する。
 * POST body: { videoId: string, roomId: string }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  let body: { videoId?: string; roomId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
  const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
  if (!videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const oembed = await fetchOEmbed(videoId);
  const title = oembed?.title ?? null;
  const artist = oembed?.author_name ?? null;

  const { error } = await supabase.from('user_song_history').insert({
    user_id: session.user.id,
    room_id: roomId,
    video_id: videoId,
    url,
    title,
    artist,
  });

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: '履歴テーブルがありません。docs/supabase-song-history-table.md の SQL を実行してください。' },
        { status: 503 }
      );
    }
    console.error('[song-history]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
