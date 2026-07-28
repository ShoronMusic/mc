import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { fetchVideoIdsWithAiCommentary } from '@/lib/library-ai-commentary-presence';
import { getStoredAiCommentaryForRead } from '@/lib/song-tidbits';
import { stripDbPrefixForChatDisplay } from '@/lib/ai-commentary-chat-display';

export const dynamic = 'force-dynamic';

const MAX_PRESENCE_IDS = 80;

/**
 * GET（ログイン必須・クレジット非消費）
 * - ?videoId=… → 保存済み AI 曲解説本文（再生成しない）
 * - ?presence=1&videoIds=a,b,c → 解説ありの video_id 一覧（最大 80）
 */
export async function GET(request: Request) {
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

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const presence = searchParams.get('presence') === '1';

  if (presence) {
    const raw = (searchParams.get('videoIds') ?? '').trim();
    if (!raw) {
      return NextResponse.json({ presentVideoIds: [] as string[] });
    }
    const videoIds = raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, MAX_PRESENCE_IDS);
    const present = await fetchVideoIdsWithAiCommentary(admin, videoIds);
    return NextResponse.json({ presentVideoIds: [...present] });
  }

  const videoId = (searchParams.get('videoId') ?? '').trim();
  if (!videoId) {
    return NextResponse.json({ error: 'videoId が必要です。' }, { status: 400 });
  }

  const stored = await getStoredAiCommentaryForRead(admin, videoId);
  if (!stored) {
    return NextResponse.json({
      videoId,
      found: false as const,
      baseComment: null as string | null,
      freeComments: [] as string[],
    });
  }

  return NextResponse.json({
    videoId,
    found: true as const,
    baseComment: stripDbPrefixForChatDisplay(stored.baseComment),
    freeComments: stored.freeComments.map((c) => stripDbPrefixForChatDisplay(c)),
  });
}
