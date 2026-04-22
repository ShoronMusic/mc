import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { appendThemePlaylistRoomEntry } from '@/lib/theme-playlist-room-blurb-server';

export const dynamic = 'force-dynamic';

/**
 * POST: 部屋でお題付き選曲したあと、曲解説の流れの後に呼ぶ想定。
 * ミッションに1曲追加し、AI 講評文を返す（チャット表示はクライアント）。
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  let body: {
    themeId?: string;
    videoId?: string;
    commentaryContext?: string;
    selectorDisplayName?: string;
    roomId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const themeId = typeof body?.themeId === 'string' ? body.themeId.trim() : '';
  const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
  const commentaryContext =
    typeof body?.commentaryContext === 'string' ? body.commentaryContext : '';
  const selectorDisplayName =
    typeof body?.selectorDisplayName === 'string' ? body.selectorDisplayName : '';
  const roomId = typeof body?.roomId === 'string' ? body.roomId : '';

  if (!themeId || !videoId) {
    return NextResponse.json({ error: 'themeId と videoId が必要です。' }, { status: 400 });
  }

  const result = await appendThemePlaylistRoomEntry(
    user.id,
    themeId,
    videoId,
    commentaryContext,
    selectorDisplayName,
    roomId,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    ai_comment: result.ai_comment,
    ai_overall_comment: result.ai_overall_comment,
    entry_count: result.entry_count,
    completed: result.completed,
    mission_id: result.mission_id,
  });
}
