import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchUserAtQuestionHistory, attachAtQuestionCostEstimates, fetchGeminiLogsForAtQuestionPairs } from '@/lib/user-at-question-history';
import type { ParticipationHistoryRow } from '@/lib/participation-summary';

export const dynamic = 'force-dynamic';

function resolveRoomLabelMap(rows: ParticipationHistoryRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const roomId = row.room_id?.trim();
    if (!roomId || map.has(roomId)) continue;
    const title = row.gathering_title?.trim();
    map.set(roomId, title || `ルーム ${roomId}`);
  }
  return map;
}

/** GET: ログインユーザー本人の @ 質問と AI 回答履歴（room_chat_log） */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ enabled: false, error: '認証が利用できません。' }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ enabled: false, error: 'ログインが必要です。' }, { status: 401 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({
        enabled: false,
        hint: 'サーバーに SUPABASE_SERVICE_ROLE_KEY がありません。',
        pairs: [],
      });
    }

    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get('limit') ?? '30');
    const limit = Number.isFinite(limitRaw) ? limitRaw : 30;

    const { data: participationRows } = await supabase
      .from('user_room_participation_history')
      .select('room_id, gathering_title')
      .order('joined_at', { ascending: false })
      .limit(200);

    const roomLabels = resolveRoomLabelMap((participationRows ?? []) as ParticipationHistoryRow[]);

    const { pairs, missingTable } = await fetchUserAtQuestionHistory(admin, user.id, {
      limit,
      roomLabels,
    });

    if (missingTable) {
      return NextResponse.json({
        enabled: false,
        hint: 'room_chat_log テーブルがありません。docs/supabase-room-chat-log-table.md を参照してください。',
        pairs: [],
      });
    }

    let enrichedPairs = pairs;
    const { logs: geminiLogs } = await fetchGeminiLogsForAtQuestionPairs(admin, user.id, pairs);
    if (geminiLogs.length > 0) {
      enrichedPairs = attachAtQuestionCostEstimates(pairs, geminiLogs, user.id);
    } else {
      enrichedPairs = pairs.map((p) => ({ ...p, costSource: 'typical' as const }));
    }

    return NextResponse.json({
      enabled: true,
      pairCount: enrichedPairs.length,
      pairs: enrichedPairs,
    });
  } catch (e) {
    console.error('[api/user/at-question-history GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
