import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { fetchVideoIdsWithAiCommentary } from '@/lib/library-ai-commentary-presence';
import { getStoredAiCommentaryForRead } from '@/lib/song-tidbits';
import { getCommentaryByVideoId } from '@/lib/commentary-library';
import { stripDbPrefixForChatDisplay } from '@/lib/ai-commentary-chat-display';

export const dynamic = 'force-dynamic';

const MAX_PRESENCE_IDS = 80;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function foundResponse(videoId: string, baseComment: string, freeComments: string[]) {
  return NextResponse.json({
    videoId,
    found: true as const,
    baseComment: stripDbPrefixForChatDisplay(baseComment),
    freeComments: freeComments.map((c) => stripDbPrefixForChatDisplay(c)),
  });
}

function emptyResponse(videoId: string) {
  return NextResponse.json({
    videoId,
    found: false as const,
    baseComment: null as string | null,
    freeComments: [] as string[],
  });
}

/**
 * GET（クレジット非消費）
 * - ?videoId=… / ?songId=… → 保存済み曲解説本文（再生成しない。ライブラリ閲覧はログイン不要）
 * - ?presence=1&videoIds=a,b,c → 解説ありの video_id 一覧（ログイン必須・最大 80）
 */
export async function GET(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const presence = searchParams.get('presence') === '1';

  if (presence) {
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
  const songIdRaw = (searchParams.get('songId') ?? '').trim();
  const songId = UUID_PATTERN.test(songIdRaw) ? songIdRaw : '';
  if (!videoId && !songId) {
    return NextResponse.json({ error: 'videoId または songId が必要です。' }, { status: 400 });
  }

  if (videoId) {
    const stored = await getStoredAiCommentaryForRead(admin, videoId);
    if (stored?.baseComment) {
      return foundResponse(videoId, stored.baseComment, stored.freeComments);
    }
  }

  if (songId) {
    const { data: bySong, error } = await admin
      .from('song_tidbits')
      .select('body, video_id')
      .eq('song_id', songId)
      .eq('source', 'ai_commentary')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error) {
      const body = typeof (bySong as { body?: string } | null)?.body === 'string'
        ? (bySong as { body: string }).body.trim()
        : '';
      if (body) {
        const vid =
          typeof (bySong as { video_id?: string | null }).video_id === 'string'
            ? (bySong as { video_id: string }).video_id
            : videoId;
        return foundResponse(vid || videoId, body, []);
      }
    }
  }

  if (videoId) {
    const legacy = await getCommentaryByVideoId(admin, videoId);
    if (legacy?.body?.trim()) {
      return foundResponse(videoId, legacy.body, []);
    }
  }

  return emptyResponse(videoId);
}
