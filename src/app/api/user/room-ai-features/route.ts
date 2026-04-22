import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  DEFAULT_USER_ROOM_AI_COMMENTARY_ENABLED,
  DEFAULT_USER_ROOM_AI_NEXT_SONG_RECOMMEND_ENABLED,
  DEFAULT_USER_ROOM_AI_SONG_QUIZ_ENABLED,
  parseUserRoomAiFeaturesPutBody,
} from '@/lib/user-room-ai-features';

const PERSIST_UNAVAILABLE_HINT =
  '部屋AI設定の保存用テーブル（user_room_ai_features）がありません。docs/supabase-setup.md 第 17 章の SQL を実行すると保存できます。';

export const dynamic = 'force-dynamic';

function isMissingTableError(message: string): boolean {
  return /relation|does not exist|schema cache/i.test(message);
}

/**
 * GET: 自分の部屋向け AI 設定（行なしはデフォルト ON）
 * PUT: { commentaryEnabled, songQuizEnabled, nextSongRecommendEnabled } で upsert
 */
export async function GET() {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    }
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_room_ai_features')
      .select('ai_commentary_enabled, ai_song_quiz_enabled, ai_next_song_recommend_enabled')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error.message)) {
        /** 部屋クライアントは !r.ok 時に既定 ON と同じ挙動のため、GET は 200 で返してネットワークエラーを避ける */
        return NextResponse.json({
          commentaryEnabled: DEFAULT_USER_ROOM_AI_COMMENTARY_ENABLED,
          songQuizEnabled: DEFAULT_USER_ROOM_AI_SONG_QUIZ_ENABLED,
          nextSongRecommendEnabled: DEFAULT_USER_ROOM_AI_NEXT_SONG_RECOMMEND_ENABLED,
          persistHint: PERSIST_UNAVAILABLE_HINT,
        });
      }
      console.error('[api/user/room-ai-features GET]', error);
      return NextResponse.json({ error: 'Failed to load.' }, { status: 500 });
    }

    const commentaryEnabled =
      data == null
        ? DEFAULT_USER_ROOM_AI_COMMENTARY_ENABLED
        : Boolean(data.ai_commentary_enabled);
    const songQuizEnabled =
      data == null ? DEFAULT_USER_ROOM_AI_SONG_QUIZ_ENABLED : Boolean(data.ai_song_quiz_enabled);
    const nextSongRecommendEnabled =
      data == null
        ? DEFAULT_USER_ROOM_AI_NEXT_SONG_RECOMMEND_ENABLED
        : Boolean((data as { ai_next_song_recommend_enabled?: unknown }).ai_next_song_recommend_enabled);

    return NextResponse.json({ commentaryEnabled, songQuizEnabled, nextSongRecommendEnabled });
  } catch (e) {
    console.error('[api/user/room-ai-features GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    }
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = parseUserRoomAiFeaturesPutBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const v = parsed.value;

    const { error } = await supabase.from('user_room_ai_features').upsert(
      {
        user_id: user.id,
        ai_commentary_enabled: v.commentaryEnabled,
        ai_song_quiz_enabled: v.songQuizEnabled,
        ai_next_song_recommend_enabled: v.nextSongRecommendEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (error) {
      if (isMissingTableError(error.message)) {
        return NextResponse.json(
          {
            error:
              'user_room_ai_features テーブルがありません。docs/supabase-setup.md 第 17 章を実行してください。',
          },
          { status: 503 },
        );
      }
      console.error('[api/user/room-ai-features PUT]', error);
      return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      commentaryEnabled: v.commentaryEnabled,
      songQuizEnabled: v.songQuizEnabled,
      nextSongRecommendEnabled: v.nextSongRecommendEnabled,
    });
  } catch (e) {
    console.error('[api/user/room-ai-features PUT]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
