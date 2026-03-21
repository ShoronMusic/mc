import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStyleAdminUserIds } from '@/lib/style-admin';

export const dynamic = 'force-dynamic';

const JST = 'Asia/Tokyo';
const PAGE_SIZE = 1000;
const MAX_SCAN_LOG = 100_000;
const MAX_SCAN_GEMINI = 50_000;

function toJstYmd(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** room_chat_log の AI 本文先頭がアプリ付与の [NEW] / [DB] か */
function classifyAiBodyPrefix(body: string): 'new' | 'db' | 'other' {
  const t = typeof body === 'string' ? body.trimStart() : '';
  if (t.startsWith('[NEW]')) return 'new';
  if (t.startsWith('[DB]')) return 'db';
  return 'other';
}

const GEMINI_CONTEXT_SONG_COMMENTARY = new Set([
  'comment_pack_base',
  'comment_pack_free_1',
  'comment_pack_free_2',
  'comment_pack_free_3',
  'commentary',
]);

type DayTriplet = { date_jst: string; new: number; db: number; other: number };

/**
 * STYLE_ADMIN_USER_IDS ＋ service_role のみ。
 * - room_chat_log の AI 行を [NEW]/[DB]/その他に分類（発言単位）
 * - gemini_usage_logs の曲解説・comment-pack 系・tidbit の API 回数・トークン（課金の目安）
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  const adminIds = getStyleAdminUserIds();
  if (adminIds.length === 0) {
    return NextResponse.json(
      {
        error:
          'STYLE_ADMIN_USER_IDS を .env.local に設定し、管理者アカウントでログインしてください。',
      },
      { status: 403 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) {
    return NextResponse.json(
      {
        error: 'ログインが確認できません。マイページからログインしてから再度お試しください。',
        hint: authError?.message,
      },
      { status: 403 }
    );
  }
  if (!adminIds.includes(uid)) {
    return NextResponse.json(
      { error: 'このアカウントは STYLE_ADMIN_USER_IDS に含まれていません。' },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' },
      { status: 503 }
    );
  }

  const daysParam = new URL(request.url).searchParams.get('days');
  const days = Math.min(120, Math.max(1, parseInt(daysParam || '30', 10) || 30));
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();

  // --- room_chat_log: AI 発言の [NEW]/[DB] ---
  const utterTotals = { new: 0, db: 0, other: 0 };
  const utterByDay = new Map<string, { new: number; db: number; other: number }>();
  let utterScanned = 0;
  let utterTruncated = false;
  let utterOffset = 0;

  for (;;) {
    const { data, error } = await admin
      .from('room_chat_log')
      .select('body, created_at')
      .eq('message_type', 'ai')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(utterOffset, utterOffset + PAGE_SIZE - 1);

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json(
          {
            error: 'room_chat_log テーブルがありません。',
            hint: 'docs/supabase-room-chat-log-table.md を参照してください。',
          },
          { status: 503 }
        );
      }
      console.error('[admin/ai-comment-origin-stats] room_chat_log', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const batch = data ?? [];
    if (batch.length === 0) break;

    for (const row of batch) {
      const kind = classifyAiBodyPrefix((row as { body?: string }).body ?? '');
      utterTotals[kind] += 1;
      const ymd = toJstYmd((row as { created_at: string }).created_at);
      const cur = utterByDay.get(ymd) ?? { new: 0, db: 0, other: 0 };
      cur[kind] += 1;
      utterByDay.set(ymd, cur);
    }

    utterScanned += batch.length;
    if (utterScanned >= MAX_SCAN_LOG) {
      utterTruncated = batch.length === PAGE_SIZE;
      break;
    }
    if (batch.length < PAGE_SIZE) break;
    utterOffset += PAGE_SIZE;
  }

  const utterByDayList: DayTriplet[] = Array.from(utterByDay.entries())
    .map(([date_jst, v]) => ({ date_jst, new: v.new, db: v.db, other: v.other }))
    .sort((a, b) => b.date_jst.localeCompare(a.date_jst));

  const tagged = utterTotals.new + utterTotals.db;
  const dbRatioTagged =
    tagged > 0 ? Math.round((utterTotals.db / tagged) * 1000) / 1000 : null;

  // --- gemini_usage_logs: API 課金に直結する行 ---
  const geminiSong = { calls: 0, promptTokens: 0, outputTokens: 0 };
  const geminiTidbit = { calls: 0, promptTokens: 0, outputTokens: 0 };
  const geminiByDaySong = new Map<string, { calls: number; prompt: number; output: number }>();
  const geminiByDayTidbit = new Map<string, { calls: number; prompt: number; output: number }>();
  let geminiScanned = 0;
  let geminiTruncated = false;
  let geminiOffset = 0;
  let geminiTableMissing = false;

  for (;;) {
    const { data, error } = await admin
      .from('gemini_usage_logs')
      .select('context, created_at, prompt_token_count, output_token_count')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(geminiOffset, geminiOffset + PAGE_SIZE - 1);

    if (error) {
      if (error.code === '42P01') {
        geminiTableMissing = true;
        break;
      }
      console.error('[admin/ai-comment-origin-stats] gemini_usage_logs', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const batch = data ?? [];
    if (batch.length === 0) break;

    for (const row of batch) {
      const ctx = typeof (row as { context?: string }).context === 'string' ? (row as { context: string }).context : '';
      const p = (row as { prompt_token_count?: number | null }).prompt_token_count ?? 0;
      const o = (row as { output_token_count?: number | null }).output_token_count ?? 0;
      const ymd = toJstYmd((row as { created_at: string }).created_at);
      const pr = Number.isFinite(p) ? p : 0;
      const ou = Number.isFinite(o) ? o : 0;

      if (GEMINI_CONTEXT_SONG_COMMENTARY.has(ctx)) {
        geminiSong.calls += 1;
        geminiSong.promptTokens += pr;
        geminiSong.outputTokens += ou;
        const d = geminiByDaySong.get(ymd) ?? { calls: 0, prompt: 0, output: 0 };
        d.calls += 1;
        d.prompt += pr;
        d.output += ou;
        geminiByDaySong.set(ymd, d);
      } else if (ctx === 'tidbit') {
        geminiTidbit.calls += 1;
        geminiTidbit.promptTokens += pr;
        geminiTidbit.outputTokens += ou;
        const d = geminiByDayTidbit.get(ymd) ?? { calls: 0, prompt: 0, output: 0 };
        d.calls += 1;
        d.prompt += pr;
        d.output += ou;
        geminiByDayTidbit.set(ymd, d);
      }
    }

    geminiScanned += batch.length;
    if (geminiScanned >= MAX_SCAN_GEMINI) {
      geminiTruncated = batch.length === PAGE_SIZE;
      break;
    }
    if (batch.length < PAGE_SIZE) break;
    geminiOffset += PAGE_SIZE;
  }

  const geminiSongByDay = Array.from(geminiByDaySong.entries())
    .map(([date_jst, v]) => ({
      date_jst,
      calls: v.calls,
      promptTokens: v.prompt,
      outputTokens: v.output,
    }))
    .sort((a, b) => b.date_jst.localeCompare(a.date_jst));

  const geminiTidbitByDay = Array.from(geminiByDayTidbit.entries())
    .map(([date_jst, v]) => ({
      date_jst,
      calls: v.calls,
      promptTokens: v.prompt,
      outputTokens: v.output,
    }))
    .sort((a, b) => b.date_jst.localeCompare(a.date_jst));

  return NextResponse.json({
    days,
    utterances: {
      totals: utterTotals,
      byDay: utterByDayList,
      scanned: utterScanned,
      truncated: utterTruncated,
      dbRatioAmongTagged: dbRatioTagged,
    },
    gemini: {
      tableMissing: geminiTableMissing,
      songCommentary: {
        ...geminiSong,
        byDay: geminiSongByDay,
      },
      tidbit: {
        ...geminiTidbit,
        byDay: geminiTidbitByDay,
      },
      scanned: geminiScanned,
      truncated: geminiTruncated,
    },
  });
}
