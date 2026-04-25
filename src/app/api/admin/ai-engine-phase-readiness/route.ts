import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  PHASE1_DEFAULT_GATES,
  evaluateCustomLlmReadiness,
  evaluatePhase1GoNoGo,
} from '@/lib/ai-engine-phases';
import {
  buildPhase1ObservedMetrics,
  computeExternalModelPersonaFitScore,
  estimatePeriodInferenceCostJpy,
} from '@/lib/ai-engine-metrics';

export const dynamic = 'force-dynamic';

function getDays(request: Request): number {
  const raw = new URL(request.url).searchParams.get('days');
  const parsed = parseInt(raw || '7', 10) || 7;
  return Math.min(90, Math.max(1, parsed));
}

function getSinceIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function getMonthlyDays(request: Request): number {
  const raw = new URL(request.url).searchParams.get('monthlyDays');
  const parsed = parseInt(raw || '30', 10) || 30;
  return Math.min(120, Math.max(7, parsed));
}

const MAX_ROWS = 10000;

export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const days = getDays(request);
  const monthlyDays = getMonthlyDays(request);
  const sinceIso = getSinceIso(days);
  const monthlySinceIso = getSinceIso(monthlyDays);

  const [chatRes, feedbackRes, usageRes, monthlyUsageRes] = await Promise.all([
    admin
      .from('room_chat_log')
      .select('room_id, message_type, display_name, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS),
    admin
      .from('comment_feedback')
      .select('source, is_upvote, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS),
    admin
      .from('gemini_usage_logs')
      .select('prompt_token_count, output_token_count, room_id, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS),
    admin
      .from('gemini_usage_logs')
      .select('prompt_token_count, output_token_count, room_id, created_at')
      .gte('created_at', monthlySinceIso)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS),
  ]);

  const knownMissing =
    chatRes.error?.code === '42P01' ||
    feedbackRes.error?.code === '42P01' ||
    usageRes.error?.code === '42P01' ||
    monthlyUsageRes.error?.code === '42P01';

  if (knownMissing) {
    return NextResponse.json(
      {
        error:
          '必要テーブルが不足しています。room_chat_log / comment_feedback / gemini_usage_logs の SQL 適用を確認してください。',
      },
      { status: 503 },
    );
  }

  if (chatRes.error || feedbackRes.error || usageRes.error || monthlyUsageRes.error) {
    console.error('[admin/ai-engine-phase-readiness]', {
      chat: chatRes.error?.message,
      feedback: feedbackRes.error?.message,
      usage: usageRes.error?.message,
      monthlyUsage: monthlyUsageRes.error?.message,
    });
    return NextResponse.json({ error: 'メトリクス集計に失敗しました。' }, { status: 500 });
  }

  const observed = buildPhase1ObservedMetrics(
    (chatRes.data ?? []).map((r) => ({
      room_id: r.room_id ?? null,
      message_type: r.message_type ?? null,
      display_name: r.display_name ?? null,
      created_at: r.created_at ?? null,
    })),
    (feedbackRes.data ?? []).map((r) => ({
      source: r.source ?? null,
      is_upvote: typeof r.is_upvote === 'boolean' ? r.is_upvote : null,
    })),
    (usageRes.data ?? []).map((r) => ({
      prompt_token_count: r.prompt_token_count ?? null,
      output_token_count: r.output_token_count ?? null,
      room_id: r.room_id ?? null,
    })),
  );

  const phase1Gate = evaluatePhase1GoNoGo(observed, PHASE1_DEFAULT_GATES);
  const feedbackRows = (feedbackRes.data ?? []).map((r) => ({
    source: r.source ?? null,
    is_upvote: typeof r.is_upvote === 'boolean' ? r.is_upvote : null,
  }));
  const personaFitScore = computeExternalModelPersonaFitScore(feedbackRows);
  const monthlyInferenceCostJpy = estimatePeriodInferenceCostJpy(
    (monthlyUsageRes.data ?? []).map((r) => ({
      prompt_token_count: r.prompt_token_count ?? null,
      output_token_count: r.output_token_count ?? null,
      room_id: r.room_id ?? null,
    })),
  );
  const phase3Readiness = evaluateCustomLlmReadiness({
    monthlyInferenceCostJpy,
    externalModelPersonaFitScore: personaFitScore,
    dataGovernanceReady: false,
    evalPipelineReady: false,
    failoverReady: false,
  });

  return NextResponse.json({
    days,
    monthlyDays,
    sinceIso,
    monthlySinceIso,
    observed,
    derived: {
      externalModelPersonaFitScore: personaFitScore,
      monthlyInferenceCostJpy,
    },
    phase1Gate: {
      thresholds: PHASE1_DEFAULT_GATES,
      ...phase1Gate,
    },
    phase3Readiness,
    sampleSize: {
      roomChatLog: (chatRes.data ?? []).length,
      commentFeedback: (feedbackRes.data ?? []).length,
      geminiUsageLogs: (usageRes.data ?? []).length,
      geminiUsageLogsMonthly: (monthlyUsageRes.data ?? []).length,
    },
    notes: [
      'suggestionAdoptionRate は next_song_recommend の upvote 比率を代理指標として使用しています。',
      'externalModelPersonaFitScore は chat_reply の upvote 比率を代理指標として使用しています。',
    ],
  });
}
