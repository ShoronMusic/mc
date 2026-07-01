/**
 * 会（gathering）終了時の開催履歴スナップショット集計・保存
 * SQL: docs/supabase-room-gathering-snapshots-table.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addGeminiLogToSummary,
  emptyGeminiUsageSummary,
  type GeminiUsageTokenSummary,
} from '@/lib/gemini-pricing';
import type { GeminiUsageBillingKind } from '@/lib/gemini-usage-attribution';

type GatheringRow = {
  id: string;
  room_id: string;
  title: string;
  started_at: string | null;
  ended_at: string | null;
  created_by: string | null;
};

type GeminiLogRow = {
  context: string;
  model: string | null;
  prompt_token_count: number | null;
  output_token_count: number | null;
  billing_kind: string | null;
  user_id: string | null;
  trigger_user_id: string | null;
};

type ParticipationRow = {
  user_id: string;
  display_name: string | null;
  joined_at: string;
  left_at: string | null;
};

type PlaybackRow = {
  user_id: string | null;
  played_at: string;
};

type ChatRow = {
  message_type: string | null;
  gathering_id: string | null;
  created_at: string;
};

export type GatheringSnapshotPersistResult =
  | { ok: true; gatheringId: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; error: string };

export function gatheringDurationMs(
  startedAt: string | null,
  endedAt: string | null,
): number | null {
  if (!startedAt || !endedAt) return null;
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return endMs - startMs;
}

function inGatheringWindow(iso: string, startIso: string, endIso: string): boolean {
  const ms = new Date(iso).getTime();
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(ms) || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return ms >= startMs && ms <= endMs;
}

function participantStayMs(row: ParticipationRow, endIso: string): number {
  const joinedMs = new Date(row.joined_at).getTime();
  const leftMs = row.left_at ? new Date(row.left_at).getTime() : new Date(endIso).getTime();
  if (!Number.isFinite(joinedMs) || !Number.isFinite(leftMs) || leftMs <= joinedMs) return 0;
  return leftMs - joinedMs;
}

function emptyBillingKindMap(): Record<GeminiUsageBillingKind, GeminiUsageTokenSummary> {
  return {
    participant_user: emptyGeminiUsageSummary(),
    guest_enjoy_owner_paid: emptyGeminiUsageSummary(),
    room_owner: emptyGeminiUsageSummary(),
    ai_agent: emptyGeminiUsageSummary(),
  };
}

function addToBillingKindMap(
  map: Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>,
  kind: string | null,
  log: GeminiLogRow,
): void {
  const key =
    kind === 'participant_user' ||
    kind === 'guest_enjoy_owner_paid' ||
    kind === 'room_owner' ||
    kind === 'ai_agent'
      ? kind
      : 'room_owner';
  addGeminiLogToSummary(map[key], log);
}

/** 終了した会ごとにスナップショットを保存（冪等・テーブル未作成時はスキップ） */
export async function persistRoomGatheringSnapshots(
  admin: SupabaseClient,
  gatheringIds: string[],
  options?: { endReason?: string },
): Promise<GatheringSnapshotPersistResult[]> {
  const ids = Array.from(new Set(gatheringIds.map((id) => id.trim()).filter(Boolean)));
  const results: GatheringSnapshotPersistResult[] = [];
  for (const gatheringId of ids) {
    results.push(await persistRoomGatheringSnapshot(admin, gatheringId, options));
  }
  return results;
}

export async function persistRoomGatheringSnapshot(
  admin: SupabaseClient,
  gatheringId: string,
  options?: { endReason?: string },
): Promise<GatheringSnapshotPersistResult> {
  const id = gatheringId.trim();
  if (!id) return { ok: false, skipped: true, reason: 'empty_gathering_id' };

  const { data: existing, error: existErr } = await admin
    .from('room_gathering_snapshots')
    .select('gathering_id')
    .eq('gathering_id', id)
    .maybeSingle();

  if (existErr) {
    if (existErr.code === '42P01') {
      return { ok: false, skipped: true, reason: 'snapshot_table_missing' };
    }
    return { ok: false, error: existErr.message };
  }
  if (existing) return { ok: false, skipped: true, reason: 'already_snapshotted' };

  const { data: gathering, error: gErr } = await admin
    .from('room_gatherings')
    .select('id, room_id, title, started_at, ended_at, created_by')
    .eq('id', id)
    .maybeSingle();

  if (gErr) {
    if (gErr.code === '42P01') return { ok: false, skipped: true, reason: 'gatherings_table_missing' };
    return { ok: false, error: gErr.message };
  }
  if (!gathering) return { ok: false, skipped: true, reason: 'gathering_not_found' };

  const g = gathering as GatheringRow;
  const endedAt = g.ended_at?.trim() || null;
  const startedAt = g.started_at?.trim() || endedAt;
  if (!endedAt || !startedAt) {
    return { ok: false, skipped: true, reason: 'gathering_not_ended' };
  }

  const roomId = g.room_id.trim();
  const durationMs = gatheringDurationMs(startedAt, endedAt);

  const { data: lobby } = await admin
    .from('room_lobby_message')
    .select('display_title')
    .eq('room_id', roomId)
    .maybeSingle();
  const roomDisplayTitle =
    lobby && typeof (lobby as { display_title?: unknown }).display_title === 'string'
      ? (lobby as { display_title: string }).display_title.trim() || null
      : null;

  let ownerDisplayName: string | null = null;
  if (g.created_by) {
    const { data: ownerPart } = await admin
      .from('user_room_participation_history')
      .select('display_name')
      .eq('user_id', g.created_by)
      .eq('room_id', roomId)
      .order('joined_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ownerPart && typeof (ownerPart as { display_name?: unknown }).display_name === 'string') {
      ownerDisplayName = (ownerPart as { display_name: string }).display_name.trim() || null;
    }
  }

  const { data: playRows, error: playErr } = await admin
    .from('room_playback_history')
    .select('user_id, played_at')
    .eq('room_id', roomId)
    .gte('played_at', startedAt)
    .lte('played_at', endedAt)
    .limit(5000);

  if (playErr && playErr.code !== '42P01') {
    return { ok: false, error: playErr.message };
  }
  const plays = (playRows ?? []) as PlaybackRow[];
  const songCountTotal = plays.length;

  let chatUserMessages = 0;
  let chatAiMessages = 0;
  let ablyMessagesEstimated = 0;

  const { data: chatByGathering, error: chatGErr } = await admin
    .from('room_chat_log')
    .select('message_type, gathering_id, created_at')
    .eq('gathering_id', id)
    .limit(8000);

  if (!chatGErr && (chatByGathering?.length ?? 0) > 0) {
    for (const row of chatByGathering as ChatRow[]) {
      ablyMessagesEstimated += 1;
      const mt = (row.message_type ?? '').toLowerCase();
      if (mt === 'user') chatUserMessages += 1;
      else if (mt === 'ai') chatAiMessages += 1;
    }
  } else {
    const { data: chatByTime, error: chatTErr } = await admin
      .from('room_chat_log')
      .select('message_type, gathering_id, created_at')
      .eq('room_id', roomId)
      .gte('created_at', startedAt)
      .lte('created_at', endedAt)
      .limit(8000);
    if (!chatTErr) {
      for (const row of (chatByTime ?? []) as ChatRow[]) {
        ablyMessagesEstimated += 1;
        const mt = (row.message_type ?? '').toLowerCase();
        if (mt === 'user') chatUserMessages += 1;
        else if (mt === 'ai') chatAiMessages += 1;
      }
    }
  }

  const geminiTotals = emptyGeminiUsageSummary();
  const geminiByBillingKind = emptyBillingKindMap();
  const geminiByUser = new Map<string, GeminiUsageTokenSummary>();

  const { data: geminiRows, error: geminiErr } = await admin
    .from('gemini_usage_logs')
    .select(
      'context, model, prompt_token_count, output_token_count, billing_kind, user_id, trigger_user_id, created_at, gathering_id, room_id',
    )
    .eq('gathering_id', id)
    .limit(8000);

  let geminiLogs = (geminiRows ?? []) as (GeminiLogRow & {
    created_at: string;
    gathering_id: string | null;
    room_id: string | null;
  })[];

  if ((geminiErr && geminiErr.code === '42703') || geminiLogs.length === 0) {
    const { data: fallbackRows, error: fbErr } = await admin
      .from('gemini_usage_logs')
      .select('context, model, prompt_token_count, output_token_count, user_id, created_at, room_id')
      .eq('room_id', roomId)
      .gte('created_at', startedAt)
      .lte('created_at', endedAt)
      .limit(8000);
    if (!fbErr) {
      geminiLogs = (fallbackRows ?? []).map((r) => {
        const row = r as unknown as GeminiLogRow & { created_at: string };
        return {
          context: row.context,
          model: row.model,
          prompt_token_count: row.prompt_token_count,
          output_token_count: row.output_token_count,
          billing_kind: null,
          user_id: row.user_id,
          trigger_user_id: row.user_id,
          created_at: row.created_at,
          gathering_id: null,
          room_id: roomId,
        };
      });
    }
  } else if (geminiErr && geminiErr.code !== '42P01') {
    return { ok: false, error: geminiErr.message };
  }

  for (const log of geminiLogs) {
    if (log.gathering_id !== id && !inGatheringWindow(log.created_at, startedAt, endedAt)) {
      continue;
    }
    addGeminiLogToSummary(geminiTotals, log);
    addToBillingKindMap(geminiByBillingKind, log.billing_kind, log);
    const uid = (log.trigger_user_id ?? log.user_id)?.trim();
    if (uid) {
      if (!geminiByUser.has(uid)) geminiByUser.set(uid, emptyGeminiUsageSummary());
      addGeminiLogToSummary(geminiByUser.get(uid)!, log);
    }
  }

  const geminiByBillingKindJson: Record<string, GeminiUsageTokenSummary> = {};
  for (const [kind, summary] of Object.entries(geminiByBillingKind)) {
    if (summary.calls > 0) geminiByBillingKindJson[kind] = summary;
  }

  let aiCharacterPickCount = 0;
  const { count: pickCount, error: pickErr } = await admin
    .from('ai_character_song_pick_logs')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .gte('created_at', startedAt)
    .lte('created_at', endedAt);
  if (!pickErr && typeof pickCount === 'number') {
    aiCharacterPickCount = pickCount;
  }

  const { data: partRows, error: partErr } = await admin
    .from('user_room_participation_history')
    .select('user_id, display_name, joined_at, left_at')
    .eq('gathering_id', id)
    .limit(500);

  let participants = (partRows ?? []) as ParticipationRow[];
  if (partErr || participants.length === 0) {
    const { data: partFallback } = await admin
      .from('user_room_participation_history')
      .select('user_id, display_name, joined_at, left_at')
      .eq('room_id', roomId)
      .gte('joined_at', startedAt)
      .lte('joined_at', endedAt)
      .limit(500);
    participants = (partFallback ?? []) as ParticipationRow[];
  }

  const songCountByUser = new Map<string, number>();
  for (const p of plays) {
    const uid = p.user_id?.trim();
    if (!uid) continue;
    songCountByUser.set(uid, (songCountByUser.get(uid) ?? 0) + 1);
  }

  const participantSnapshots: Record<string, unknown>[] = [];
  const seenUsers = new Set<string>();
  for (const row of participants) {
    const uid = row.user_id?.trim();
    if (!uid || seenUsers.has(uid)) continue;
    seenUsers.add(uid);
    const stayMs = participantStayMs(row, endedAt);
    const gemini = geminiByUser.get(uid) ?? emptyGeminiUsageSummary();
    participantSnapshots.push({
      gathering_id: id,
      user_id: uid,
      display_name: row.display_name?.trim() || '（表示名なし）',
      is_guest: false,
      is_ai_agent: false,
      stay_ms: stayMs,
      song_count: songCountByUser.get(uid) ?? 0,
      gemini_calls: gemini.calls,
      gemini_prompt_tokens: gemini.promptTokens,
      gemini_output_tokens: gemini.outputTokens,
      gemini_cost_jpy_approx: Math.round(gemini.costJpyApprox * 100) / 100,
    });
  }

  const aiAgentGemini = geminiByBillingKind.ai_agent;
  if (aiCharacterPickCount > 0 || aiAgentGemini.calls > 0) {
    participantSnapshots.push({
      gathering_id: id,
      user_id: null,
      display_name: 'AI エージェント',
      is_guest: false,
      is_ai_agent: true,
      stay_ms: durationMs ?? 0,
      song_count: aiCharacterPickCount,
      gemini_calls: aiAgentGemini.calls,
      gemini_prompt_tokens: aiAgentGemini.promptTokens,
      gemini_output_tokens: aiAgentGemini.outputTokens,
      gemini_cost_jpy_approx: Math.round(aiAgentGemini.costJpyApprox * 100) / 100,
    });
  }

  const snapshotRow = {
    gathering_id: id,
    room_id: roomId,
    room_display_title: roomDisplayTitle,
    gathering_title: g.title,
    owner_user_id: g.created_by,
    owner_display_name: ownerDisplayName,
    started_at: startedAt,
    ended_at: endedAt,
    duration_ms: durationMs,
    end_reason: options?.endReason?.trim() || null,
    song_count_total: songCountTotal,
    chat_user_messages: chatUserMessages,
    chat_ai_messages: chatAiMessages,
    participant_count: seenUsers.size,
    gemini_calls: geminiTotals.calls,
    gemini_prompt_tokens: geminiTotals.promptTokens,
    gemini_output_tokens: geminiTotals.outputTokens,
    gemini_cost_usd: Math.round(geminiTotals.costUsd * 1_000_000) / 1_000_000,
    gemini_cost_jpy_approx: Math.round(geminiTotals.costJpyApprox * 100) / 100,
    gemini_by_billing_kind: geminiByBillingKindJson,
    youtube_api_calls: 0,
    ably_messages_estimated: ablyMessagesEstimated,
    ai_character_pick_count: aiCharacterPickCount,
    snapshot_version: 1,
  };

  const { error: insErr } = await admin.from('room_gathering_snapshots').insert(snapshotRow);
  if (insErr) {
    if (insErr.code === '42P01') return { ok: false, skipped: true, reason: 'snapshot_table_missing' };
    return { ok: false, error: insErr.message };
  }

  if (participantSnapshots.length > 0) {
    const { error: partInsErr } = await admin
      .from('room_gathering_participant_snapshots')
      .insert(participantSnapshots);
    if (partInsErr && partInsErr.code !== '42P01') {
      console.error('[room-gathering-snapshot] participant insert', partInsErr.message);
    }
  }

  return { ok: true, gatheringId: id };
}
