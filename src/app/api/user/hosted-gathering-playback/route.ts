import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export type HostedGatheringPlaybackSummary = {
  gatheringId: string;
  roomId: string;
  gatheringTitle: string;
  roomDisplayTitle: string | null;
  startedAt: string | null;
  endedAt: string | null;
  songCount: number;
  endReason: string | null;
};

export type HostedGatheringPlaybackRow = {
  id: string;
  video_id: string;
  display_name: string;
  is_guest: boolean;
  played_at: string;
  title: string | null;
  artist_name: string | null;
  style: string | null;
  selection_round: number | null;
  era: string | null;
};

const LIST_LIMIT = 80;
const DETAIL_LIMIT = 5000;

function safeGatheringId(raw: string | null): string | null {
  const t = raw?.trim() ?? '';
  if (!t || t.length > 80 || !/^[a-zA-Z0-9-]+$/.test(t)) return null;
  return t;
}

async function assertGatheringOwner(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  userId: string,
  gatheringId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await supabase
    .from('room_gathering_snapshots')
    .select('gathering_id')
    .eq('gathering_id', gatheringId)
    .eq('owner_user_id', userId)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') {
      return { ok: false, status: 503, error: '開催履歴テーブルがありません。' };
    }
    return { ok: false, status: 500, error: error.message };
  }
  if (!data) {
    return { ok: false, status: 404, error: '会が見つからないか、閲覧権限がありません。' };
  }
  return { ok: true };
}

/**
 * GET /api/user/hosted-gathering-playback
 * - 一覧: gatheringId なし → 主催した終了会（スナップショット）の一覧
 * - 詳細: gatheringId あり → 当該会の保存済み視聴履歴行
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const gatheringId = safeGatheringId(searchParams.get('gatheringId'));

  if (gatheringId) {
    const gate = await assertGatheringOwner(supabase, user.id, gatheringId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const { data, error } = await supabase
      .from('room_gathering_playback_snapshots')
      .select(
        'id, video_id, display_name, is_guest, played_at, title, artist_name, style, selection_round',
      )
      .eq('gathering_id', gatheringId)
      .order('sort_order', { ascending: true })
      .limit(DETAIL_LIMIT);

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json(
          {
            error:
              '視聴履歴スナップショットテーブルがありません。docs/supabase-room-gathering-snapshots-table.md の追補 SQL を実行してください。',
            items: [] as HostedGatheringPlaybackRow[],
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    const videoIds = Array.from(new Set(rows.map((r) => r.video_id).filter(Boolean)));
    const eraMap = new Map<string, string>();
    if (videoIds.length > 0) {
      const { data: eraRows, error: eraErr } = await supabase
        .from('song_era')
        .select('video_id, era')
        .in('video_id', videoIds);
      if (!eraErr && eraRows?.length) {
        for (const e of eraRows) {
          if (e.video_id && typeof e.era === 'string' && e.era.trim()) {
            eraMap.set(e.video_id, e.era.trim());
          }
        }
      }
    }

    const items: HostedGatheringPlaybackRow[] = rows.map((row) => ({
      id: String(row.id ?? ''),
      video_id: row.video_id,
      display_name: row.display_name,
      is_guest: Boolean(row.is_guest),
      played_at: row.played_at,
      title: row.title,
      artist_name: row.artist_name,
      style: row.style,
      selection_round:
        typeof row.selection_round === 'number' && Number.isFinite(row.selection_round)
          ? Math.floor(row.selection_round)
          : null,
      era: eraMap.get(row.video_id) ?? null,
    }));

    return NextResponse.json({ gatheringId, items });
  }

  const { data, error } = await supabase
    .from('room_gathering_snapshots')
    .select(
      'gathering_id, room_id, gathering_title, room_display_title, started_at, ended_at, song_count_total, end_reason',
    )
    .eq('owner_user_id', user.id)
    .order('ended_at', { ascending: false, nullsFirst: false })
    .limit(LIST_LIMIT);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: '開催履歴テーブルがありません。',
          items: [] as HostedGatheringPlaybackSummary[],
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items: HostedGatheringPlaybackSummary[] = (data ?? []).map((row) => ({
    gatheringId: String(row.gathering_id ?? ''),
    roomId: String(row.room_id ?? ''),
    gatheringTitle: String(row.gathering_title ?? '未設定の会'),
    roomDisplayTitle:
      typeof row.room_display_title === 'string' && row.room_display_title.trim()
        ? row.room_display_title.trim()
        : null,
    startedAt: typeof row.started_at === 'string' ? row.started_at : null,
    endedAt: typeof row.ended_at === 'string' ? row.ended_at : null,
    songCount: typeof row.song_count_total === 'number' ? row.song_count_total : 0,
    endReason: typeof row.end_reason === 'string' ? row.end_reason : null,
  }));

  return NextResponse.json({ items });
}
