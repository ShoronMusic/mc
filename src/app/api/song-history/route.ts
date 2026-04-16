import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchOEmbed } from '@/lib/youtube-oembed';

export const dynamic = 'force-dynamic';

/** 視聴履歴 POST と同様、短時間の二重送信で同じ曲が二重に残らないようにする */
const TWO_MINUTES_MS = 2 * 60 * 1000;

function parseSelectionRound(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  return n >= 1 ? n : null;
}

/**
 * ログイン中のユーザーがチャットで貼った曲を履歴に保存する。
 * POST body: { videoId: string, roomId: string, selectionRound?: number }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  let body: { videoId?: string; roomId?: string; selectionRound?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
  const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
  const selectionRound = parseSelectionRound(body?.selectionRound);
  if (!videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
  }

  const cutoff = new Date(Date.now() - TWO_MINUTES_MS).toISOString();
  const { data: recentDup } = await supabase
    .from('user_song_history')
    .select('id')
    .eq('user_id', user.id)
    .eq('room_id', roomId)
    .eq('video_id', videoId)
    .gte('posted_at', cutoff)
    .limit(1)
    .maybeSingle();

  if (recentDup) {
    return NextResponse.json({ ok: true, skipped: 'duplicate' });
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const oembed = await fetchOEmbed(videoId);
  const title = oembed?.title ?? null;
  const artist = oembed?.author_name ?? null;

  const insertRow: Record<string, unknown> = {
    user_id: user.id,
    room_id: roomId,
    video_id: videoId,
    url,
    title,
    artist,
  };
  if (selectionRound != null) {
    insertRow.selection_round = selectionRound;
  }

  const { error } = await supabase.from('user_song_history').insert(insertRow);

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
