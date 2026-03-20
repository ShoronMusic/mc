/**
 * Gemini 呼び出し1回分を DB に記録（管理画面 `/admin/gemini-usage` 用）
 */

import { createAdminClient } from '@/lib/supabase/admin';

const MODEL = 'gemini-2.5-flash';

export type GeminiUsageMeta = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
};

let missingTableLogged = false;

/**
 * service_role があるとき gemini_usage_logs に INSERT。
 * GEMINI_USAGE_PERSIST=0 なら何もしない。
 */
export async function persistGeminiUsageLog(
  context: string,
  usage: GeminiUsageMeta | null | undefined,
  meta?: { roomId?: string | null; videoId?: string | null }
): Promise<void> {
  if (process.env.GEMINI_USAGE_PERSIST === '0') return;
  const admin = createAdminClient();
  if (!admin) return;

  const u = usage ?? {};
  const { error } = await admin.from('gemini_usage_logs').insert({
    context: context.slice(0, 120),
    model: MODEL,
    prompt_token_count: u.promptTokenCount ?? null,
    output_token_count: u.candidatesTokenCount ?? null,
    total_token_count: u.totalTokenCount ?? null,
    cached_token_count: u.cachedContentTokenCount ?? null,
    room_id: meta?.roomId?.trim() || null,
    video_id: meta?.videoId?.trim() || null,
  });

  if (error?.code === '42P01' && !missingTableLogged) {
    missingTableLogged = true;
    console.warn(
      '[gemini-usage-log] テーブル gemini_usage_logs がありません。docs/supabase-gemini-usage-logs-table.md の SQL を実行してください。'
    );
  } else if (error && error.code !== '42P01') {
    console.error('[gemini-usage-log] insert', error.message);
  }
}
