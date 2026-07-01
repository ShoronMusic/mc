/**
 * Gemini 呼び出し1回分を DB に記録（管理画面 `/admin/gemini-usage` 用）
 * 課金帰属: docs/room-gathering-history-and-ai-billing-project.md
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { resolveGenerationModelId } from '@/lib/gemini-model-routing';
import {
  resolveGeminiBillingUserId,
  resolveGeminiUsageBillingKind,
  type GeminiUsageBillingKind,
} from '@/lib/gemini-usage-attribution';
import { fetchLiveGatheringForRoom } from '@/lib/room-live-gathering';

export type GeminiUsageMeta = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
};

export type GeminiUsagePersistMeta = {
  roomId?: string | null;
  videoId?: string | null;
  /** 操作者（選曲者・質問者）。participant_user の trigger */
  userId?: string | null;
  gatheringId?: string | null;
  billingKind?: GeminiUsageBillingKind | null;
  billingUserId?: string | null;
  triggerUserId?: string | null;
  /** ゲスト操作 → guest_enjoy_owner_paid */
  isGuestTrigger?: boolean;
};

let missingTableLogged = false;

/** API ルートから persist 用 meta を組み立てる */
export function buildGeminiUsagePersistMeta(params: {
  roomId?: string | null;
  videoId?: string | null;
  userId?: string | null;
  isGuest?: boolean;
  gatheringId?: string | null;
}): GeminiUsagePersistMeta {
  const userId = params.userId?.trim() || null;
  return {
    roomId: params.roomId?.trim() || null,
    videoId: params.videoId?.trim() || null,
    userId,
    triggerUserId: userId,
    gatheringId: params.gatheringId?.trim() || null,
    isGuestTrigger: params.isGuest === true || !userId,
  };
}

/**
 * service_role があるとき gemini_usage_logs に INSERT。
 * GEMINI_USAGE_PERSIST=0 なら何もしない。
 */
export async function persistGeminiUsageLog(
  context: string,
  usage: GeminiUsageMeta | null | undefined,
  meta?: GeminiUsagePersistMeta,
): Promise<void> {
  if (process.env.GEMINI_USAGE_PERSIST === '0') return;
  const admin = createAdminClient();
  if (!admin) return;

  const u = usage ?? {};
  const roomId = meta?.roomId?.trim() || null;
  let gatheringId = meta?.gatheringId?.trim() || null;
  let ownerUserId: string | null = null;

  if (roomId && !gatheringId) {
    const live = await fetchLiveGatheringForRoom(roomId);
    gatheringId = live?.id ?? null;
    ownerUserId = live?.createdBy ?? null;
  } else if (gatheringId && roomId) {
    const live = await fetchLiveGatheringForRoom(roomId);
    if (live?.id === gatheringId) ownerUserId = live.createdBy;
  }

  const triggerUserId = meta?.triggerUserId?.trim() || meta?.userId?.trim() || null;
  const billingKind = resolveGeminiUsageBillingKind(context, {
    billingKind: meta?.billingKind,
    isGuestTrigger: meta?.isGuestTrigger,
  });
  const billingUserId = resolveGeminiBillingUserId({
    billingKind,
    triggerUserId,
    ownerUserId,
    explicitBillingUserId: meta?.billingUserId,
  });

  const row: Record<string, unknown> = {
    context: context.slice(0, 120),
    model: resolveGenerationModelId(context),
    prompt_token_count: u.promptTokenCount ?? null,
    output_token_count: u.candidatesTokenCount ?? null,
    total_token_count: u.totalTokenCount ?? null,
    cached_token_count: u.cachedContentTokenCount ?? null,
    room_id: roomId,
    video_id: meta?.videoId?.trim() || null,
    user_id: triggerUserId,
    gathering_id: gatheringId,
    billing_kind: billingKind,
    billing_user_id: billingUserId,
    trigger_user_id: triggerUserId,
    is_guest_trigger: meta?.isGuestTrigger === true,
  };

  const { error } = await admin.from('gemini_usage_logs').insert(row);

  if (error?.code === '42P01' && !missingTableLogged) {
    missingTableLogged = true;
    console.warn(
      '[gemini-usage-log] テーブル gemini_usage_logs がありません。docs/supabase-gemini-usage-logs-table.md の SQL を実行してください。',
    );
  } else if (error?.code === '42703') {
    // 旧スキーマ: 新列なしでも最低限 INSERT
    const legacyRow = {
      context: row.context,
      model: row.model,
      prompt_token_count: row.prompt_token_count,
      output_token_count: row.output_token_count,
      total_token_count: row.total_token_count,
      cached_token_count: row.cached_token_count,
      room_id: row.room_id,
      video_id: row.video_id,
      user_id: row.user_id,
    };
    const { error: legacyErr } = await admin.from('gemini_usage_logs').insert(legacyRow);
    if (legacyErr && legacyErr.code !== '42P01') {
      console.error('[gemini-usage-log] insert legacy', legacyErr.message);
    }
  } else if (error && error.code !== '42P01') {
    console.error('[gemini-usage-log] insert', error.message);
  }
}
