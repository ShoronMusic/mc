import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStyleAdminUserIds } from '@/lib/style-admin';

export const dynamic = 'force-dynamic';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const PRICING_PER_1M_USD: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-3.1-pro-preview': { input: 2.0, output: 12 },
};

type ChatLogRow = {
  created_at: string;
  message_type: 'user' | 'ai' | 'system';
  display_name: string;
};

type PlaybackRow = {
  created_at?: string;
  played_at: string;
  display_name: string;
  video_id: string;
  style: string | null;
  artist_name: string | null;
};

type EraRow = {
  video_id: string;
  era: string | null;
};

type UsageRow = {
  context: string;
  model: string;
  prompt_token_count: number | null;
  output_token_count: number | null;
};

function normalizeParticipantName(name: string | null | undefined): string {
  const t = (name ?? '').trim();
  if (!t) return '';
  return t.replace(/\s*\(G\)\s*$/i, '').trim();
}

function todayJstYmd(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type SessionPart = 'part1' | 'part2';

function jstSessionRangeUtc(ymd: string, sessionPart: SessionPart): { startIso: string; endIso: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  // 第1部: 06:00〜18:00 / 第2部: 18:00〜翌06:00
  const start = new Date(
    sessionPart === 'part1' ? `${ymd}T06:00:00+09:00` : `${ymd}T18:00:00+09:00`
  );
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 12 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function fmtJstHm(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return '--:--';
  }
}

function calcCostUsd(promptTokens: number, outputTokens: number, model: string): number {
  const p = PRICING_PER_1M_USD[model];
  if (!p) return 0;
  return (promptTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

async function requireAdmin() {
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 }) };

  const adminIds = getStyleAdminUserIds();
  if (adminIds.length === 0) {
    return {
      error: NextResponse.json(
        { error: 'STYLE_ADMIN_USER_IDS を .env.local に設定し、管理者アカウントでログインしてください。' },
        { status: 403 },
      ),
    };
  }
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) {
    return {
      error: NextResponse.json(
        {
          error:
            'ログインが確認できません。マイページからログインしてから /admin/room-daily-summary を開き直してください。',
          hint: authError?.message,
        },
        { status: 403 },
      ),
    };
  }
  if (!adminIds.includes(uid)) {
    return {
      error: NextResponse.json({ error: 'このアカウントは STYLE_ADMIN_USER_IDS に含まれていません。' }, { status: 403 }),
    };
  }
  const admin = createAdminClient();
  if (!admin) {
    return { error: NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 }) };
  }
  return { supabase, admin, uid };
}

async function generateDailySummary(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  roomId: string,
  ymd: string,
  sessionPart: SessionPart,
) {
  const range = jstSessionRangeUtc(ymd, sessionPart);
  if (!range) throw new Error('dateJst は YYYY-MM-DD 形式で指定してください。');

  const { data: chatData, error: chatError } = await supabase
    .from('room_chat_log')
    .select('created_at, message_type, display_name')
    .eq('room_id', roomId)
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .order('created_at', { ascending: true })
    .limit(10000);
  if (chatError) throw new Error(chatError.message);
  const chats = (chatData ?? []) as ChatLogRow[];

  const { data: playData, error: playError } = await supabase
    .from('room_playback_history')
    .select('played_at, display_name, video_id, style, artist_name')
    .eq('room_id', roomId)
    .gte('played_at', range.startIso)
    .lt('played_at', range.endIso)
    .order('played_at', { ascending: true })
    .limit(5000);
  if (playError) throw new Error(playError.message);
  const plays = (playData ?? []) as PlaybackRow[];

  const { data: usageData, error: usageError } = await supabase
    .from('gemini_usage_logs')
    .select('context, model, prompt_token_count, output_token_count')
    .eq('room_id', roomId)
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .limit(20000);
  if (usageError && usageError.code !== '42P01') throw new Error(usageError.message);
  const usages = ((usageData ?? []) as UsageRow[]) || [];

  const allTimes: string[] = [];
  chats.forEach((r) => allTimes.push(r.created_at));
  plays.forEach((r) => allTimes.push(r.played_at));
  allTimes.sort();
  const activeFromAt = allTimes[0] ?? range.startIso;
  const activeToAt = allTimes[allTimes.length - 1] ?? range.startIso;

  const participantsSet = new Set<string>();
  chats.forEach((r) => {
    if (r.message_type === 'user' && r.display_name?.trim()) {
      const n = normalizeParticipantName(r.display_name);
      if (n) participantsSet.add(n);
    }
  });
  plays.forEach((r) => {
    const n = normalizeParticipantName(r.display_name);
    if (n) participantsSet.add(n);
  });
  const participants = Array.from(participantsSet);

  const participantSongMap = new Map<string, number>();
  plays.forEach((p) => {
    const k = normalizeParticipantName(p.display_name) || '不明';
    participantSongMap.set(k, (participantSongMap.get(k) ?? 0) + 1);
  });
  const participantSongCounts = Array.from(participantSongMap.entries())
    .map(([displayName, count]) => ({ displayName, count }))
    .sort((a, b) => b.count - a.count);

  const styleMap = new Map<string, number>();
  const artistMap = new Map<string, number>();
  plays.forEach((p) => {
    const s = (p.style ?? 'Other').trim() || 'Other';
    styleMap.set(s, (styleMap.get(s) ?? 0) + 1);
    const a = (p.artist_name ?? '').trim();
    if (a) artistMap.set(a, (artistMap.get(a) ?? 0) + 1);
  });
  const styleDistribution = Array.from(styleMap.entries())
    .map(([style, count]) => ({ style, count }))
    .sort((a, b) => b.count - a.count);
  const artistDistribution = Array.from(artistMap.entries())
    .map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count);

  const eraMap = new Map<string, number>();
  const videoIds = Array.from(new Set(plays.map((p) => p.video_id).filter(Boolean)));
  if (videoIds.length > 0) {
    const { data: eraData, error: eraError } = await supabase
      .from('song_era')
      .select('video_id, era')
      .in('video_id', videoIds);
    if (!eraError && eraData?.length) {
      const byVid = new Map<string, string>();
      (eraData as EraRow[]).forEach((e) => {
        if (e.video_id && e.era) byVid.set(e.video_id, e.era);
      });
      plays.forEach((p) => {
        const era = byVid.get(p.video_id) ?? 'Other';
        eraMap.set(era, (eraMap.get(era) ?? 0) + 1);
      });
    }
  }
  const eraDistribution = Array.from(eraMap.entries())
    .map(([era, count]) => ({ era, count }))
    .sort((a, b) => b.count - a.count);

  let usagePrompt = 0;
  let usageOutput = 0;
  let usageCalls = 0;
  const usageByContextMap = new Map<string, { calls: number; prompt: number; output: number }>();
  const usageByModelMap = new Map<string, { calls: number; prompt: number; output: number; costUsd: number }>();
  usages.forEach((u) => {
    const p = u.prompt_token_count ?? 0;
    const o = u.output_token_count ?? 0;
    usagePrompt += p;
    usageOutput += o;
    usageCalls += 1;

    const ctx = (u.context || 'unknown').trim() || 'unknown';
    const model = (u.model || 'unknown').trim() || 'unknown';
    const c = usageByContextMap.get(ctx) ?? { calls: 0, prompt: 0, output: 0 };
    c.calls += 1;
    c.prompt += p;
    c.output += o;
    usageByContextMap.set(ctx, c);

    const m = usageByModelMap.get(model) ?? { calls: 0, prompt: 0, output: 0, costUsd: 0 };
    m.calls += 1;
    m.prompt += p;
    m.output += o;
    m.costUsd += calcCostUsd(p, o, model);
    usageByModelMap.set(model, m);
  });

  const usageByContext = Array.from(usageByContextMap.entries())
    .map(([context, v]) => ({ context, ...v }))
    .sort((a, b) => b.calls - a.calls);
  const usageByModel = Array.from(usageByModelMap.entries())
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.calls - a.calls);
  const usageCostUsd = usageByModel.reduce((s, v) => s + v.costUsd, 0);
  const usageCostJpy = usageCostUsd * 160;

  const styleTop = styleDistribution.slice(0, 2).map((v) => v.style).join('・') || '偏りなし';
  const eraTop = eraDistribution.slice(0, 2).map((v) => v.era).join('・') || '偏りなし';
  const artistTopList = artistDistribution.filter((v) => v.count >= 2);
  const artistTop = artistTopList.slice(0, 3).map((v) => v.artist).join('、') || '偏りなし';
  const topPoster = participantSongCounts[0]?.displayName ?? '該当なし';
  const sessionLabel = sessionPart === 'part1' ? '第1部（06:00〜18:00）' : '第2部（18:00〜翌06:00）';
  const summaryText =
    `${sessionLabel} の開催です。` +
    `実利用時間は ${fmtJstHm(activeFromAt)}〜${fmtJstHm(activeToAt)}（JST）。` +
    `参加者は ${participants.join('、') || 'なし'}。` +
    `選曲は ${topPoster} さん中心で、時代は ${eraTop}、スタイルは ${styleTop} が目立つ1日でした。` +
    `人気アーティストは ${artistTop} です。` +
    `Gemini使用量は ${usageCalls} 回（入力 ${usagePrompt.toLocaleString()} / 出力 ${usageOutput.toLocaleString()} トークン、概算 ¥${usageCostJpy.toFixed(2)}）です。`;

  return {
    roomId,
    dateJst: ymd,
    sessionPart,
    windowStartAt: range.startIso,
    windowEndAt: range.endIso,
    activeFromAt,
    activeToAt,
    participants,
    participantSongCounts,
    eraDistribution,
    styleDistribution,
    geminiUsage: {
      calls: usageCalls,
      promptTokens: usagePrompt,
      outputTokens: usageOutput,
      costUsd: usageCostUsd,
      costJpy: usageCostJpy,
      byContext: usageByContext,
      byModel: usageByModel,
      popularArtists: artistTopList.slice(0, 10),
    },
    summaryText,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { admin } = auth;

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId')?.trim() ?? '';
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50) || 50));

  let q = admin
    .from('room_daily_summary')
    .select(
      'id, room_id, date_jst, session_part, window_start_at, window_end_at, active_from_at, active_to_at, participants, participant_song_counts, era_distribution, style_distribution, gemini_usage, summary_text, created_by_user_id, created_at',
    )
    .order('date_jst', { ascending: false })
    .order('session_part', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (roomId) q = q.eq('room_id', roomId);

  const { data, error } = await q;
  if (error) {
    if (error.code === '42703' || /session_part/i.test(error.message)) {
      return NextResponse.json(
        {
          error: 'room_daily_summary に session_part カラムがありません。',
          hint: 'docs/supabase-room-daily-summary-table.md の「既存テーブルを更新する場合（ALTER）」を実行してください。',
        },
        { status: 503 },
      );
    }
    if (
      error.code === '42P01' ||
      /could not find the table\s+public\.room_daily_summary/i.test(error.message)
    ) {
      return NextResponse.json(
        {
          error: 'room_daily_summary テーブルがありません。',
          hint: 'docs/supabase-room-daily-summary-table.md の SQL（session_part 追加版）を実行してください。',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { admin, supabase, uid } = auth;

  let body: { roomId?: string; dateJst?: string; sessionPart?: SessionPart };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
  const dateJst = typeof body?.dateJst === 'string' && body.dateJst.trim() ? body.dateJst.trim() : todayJstYmd();
  const sessionPart: SessionPart = body?.sessionPart === 'part1' ? 'part1' : 'part2';
  if (!roomId) return NextResponse.json({ error: 'roomId is required' }, { status: 400 });

  let payload;
  try {
    payload = await generateDailySummary(supabase, roomId, dateJst, sessionPart);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'summary generation failed' }, { status: 500 });
  }

  const { data, error } = await admin
    .from('room_daily_summary')
    .upsert(
      {
        room_id: payload.roomId,
        date_jst: payload.dateJst,
        session_part: payload.sessionPart,
        window_start_at: payload.windowStartAt,
        window_end_at: payload.windowEndAt,
        active_from_at: payload.activeFromAt,
        active_to_at: payload.activeToAt,
        participants: payload.participants,
        participant_song_counts: payload.participantSongCounts,
        era_distribution: payload.eraDistribution,
        style_distribution: payload.styleDistribution,
        gemini_usage: payload.geminiUsage,
        summary_text: payload.summaryText,
        created_by_user_id: uid,
      },
      { onConflict: 'room_id,date_jst,session_part' },
    )
    .select(
      'id, room_id, date_jst, session_part, window_start_at, window_end_at, active_from_at, active_to_at, participants, participant_song_counts, era_distribution, style_distribution, gemini_usage, summary_text, created_by_user_id, created_at',
    )
    .single();

  if (error) {
    if (error.code === '42703' || /session_part/i.test(error.message)) {
      return NextResponse.json(
        {
          error: 'room_daily_summary に session_part カラムがありません。',
          hint: 'docs/supabase-room-daily-summary-table.md の「既存テーブルを更新する場合（ALTER）」を実行してください。',
        },
        { status: 503 },
      );
    }
    if (
      error.code === '42P01' ||
      /could not find the table\s+public\.room_daily_summary/i.test(error.message)
    ) {
      return NextResponse.json(
        {
          error: 'room_daily_summary テーブルがありません。',
          hint: 'docs/supabase-room-daily-summary-table.md の SQL（session_part 追加版）を実行してください。',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, item: data });
}

