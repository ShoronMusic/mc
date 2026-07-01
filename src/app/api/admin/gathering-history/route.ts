import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { formatGeminiCostJpyApprox } from '@/lib/gemini-pricing';

export const dynamic = 'force-dynamic';

type SnapshotRow = {
  gathering_id: string;
  room_id: string;
  room_display_title: string | null;
  gathering_title: string;
  owner_display_name: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  end_reason: string | null;
  song_count_total: number;
  chat_user_messages: number;
  chat_ai_messages: number;
  participant_count: number;
  gemini_calls: number;
  gemini_prompt_tokens: number;
  gemini_output_tokens: number;
  gemini_cost_jpy_approx: number | null;
  gemini_by_billing_kind: Record<string, unknown> | null;
  ably_messages_estimated: number;
  ai_character_pick_count: number;
  created_at: string;
};

type ParticipantRow = {
  id: string;
  display_name: string;
  is_guest: boolean;
  is_ai_agent: boolean;
  stay_ms: number;
  song_count: number;
  gemini_calls: number;
  gemini_cost_jpy_approx: number | null;
};

/**
 * GET: 開催履歴スナップショット一覧 / ?gatheringId= で詳細
 */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const gatheringId = url.searchParams.get('gatheringId')?.trim() || '';
  const days = Math.min(180, Math.max(1, parseInt(url.searchParams.get('days') || '60', 10) || 60));
  const since = new Date(Date.now() - days * 86400000).toISOString();

  if (gatheringId) {
    const { data: snapshot, error: snapErr } = await admin
      .from('room_gathering_snapshots')
      .select('*')
      .eq('gathering_id', gatheringId)
      .maybeSingle();

    if (snapErr) {
      if (snapErr.code === '42P01') {
        return NextResponse.json({
          enabled: false,
          hint: 'room_gathering_snapshots がありません。docs/supabase-room-gathering-snapshots-table.md の SQL を実行してください。',
        });
      }
      return NextResponse.json({ error: snapErr.message }, { status: 500 });
    }

    const { data: participants, error: partErr } = await admin
      .from('room_gathering_participant_snapshots')
      .select(
        'id, display_name, is_guest, is_ai_agent, stay_ms, song_count, gemini_calls, gemini_cost_jpy_approx',
      )
      .eq('gathering_id', gatheringId)
      .order('gemini_calls', { ascending: false });

    if (partErr && partErr.code !== '42P01') {
      return NextResponse.json({ error: partErr.message }, { status: 500 });
    }

    return NextResponse.json({
      enabled: true,
      snapshot: snapshot as SnapshotRow | null,
      participants: (participants ?? []) as ParticipantRow[],
    });
  }

  const { data: rows, error } = await admin
    .from('room_gathering_snapshots')
    .select(
      'gathering_id, room_id, room_display_title, gathering_title, owner_display_name, started_at, ended_at, duration_ms, end_reason, song_count_total, participant_count, gemini_calls, gemini_cost_jpy_approx, ably_messages_estimated, ai_character_pick_count, created_at',
    )
    .gte('ended_at', since)
    .order('ended_at', { ascending: false })
    .limit(200);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({
        enabled: false,
        hint: 'room_gathering_snapshots がありません。docs/supabase-room-gathering-snapshots-table.md の SQL を実行してください。',
        rows: [],
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as SnapshotRow[];
  const totals = list.reduce(
    (acc, row) => {
      acc.gatherings += 1;
      acc.songs += row.song_count_total ?? 0;
      acc.geminiCalls += row.gemini_calls ?? 0;
      acc.geminiJpy += row.gemini_cost_jpy_approx ?? 0;
      return acc;
    },
    { gatherings: 0, songs: 0, geminiCalls: 0, geminiJpy: 0 },
  );

  return NextResponse.json({
    enabled: true,
    lookbackDays: days,
    totals: {
      ...totals,
      geminiJpyLabel: formatGeminiCostJpyApprox(totals.geminiJpy),
    },
    rows: list,
  });
}
