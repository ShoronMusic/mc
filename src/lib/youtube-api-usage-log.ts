/**
 * YouTube Data API 呼び出しログを DB 保存（運用集計用）
 */

import { createAdminClient } from '@/lib/supabase/admin';

type YouTubeApiUsageRow = {
  endpoint: string;
  queryText?: string | null;
  videoId?: string | null;
  maxResults?: number | null;
  responseStatus?: number | null;
  ok?: boolean | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  resultCount?: number | null;
  roomId?: string | null;
  source?: string | null;
};

let missingTableLogged = false;

export async function persistYouTubeApiUsageLog(row: YouTubeApiUsageRow): Promise<void> {
  if (process.env.YOUTUBE_API_USAGE_PERSIST === '0') return;
  const admin = createAdminClient();
  if (!admin) return;

  const { error } = await admin.from('youtube_api_usage_logs').insert({
    endpoint: row.endpoint.slice(0, 80),
    query_text: row.queryText?.trim().slice(0, 300) || null,
    video_id: row.videoId?.trim().slice(0, 32) || null,
    max_results: Number.isFinite(row.maxResults) ? row.maxResults : null,
    response_status: Number.isFinite(row.responseStatus) ? row.responseStatus : null,
    ok: typeof row.ok === 'boolean' ? row.ok : null,
    error_code: row.errorCode?.trim().slice(0, 80) || null,
    error_message: row.errorMessage?.trim().slice(0, 500) || null,
    result_count: Number.isFinite(row.resultCount) ? row.resultCount : null,
    room_id: row.roomId?.trim().slice(0, 120) || null,
    source: row.source?.trim().slice(0, 120) || null,
  });

  if (error?.code === '42P01' && !missingTableLogged) {
    missingTableLogged = true;
    console.warn(
      '[youtube-api-usage-log] テーブル youtube_api_usage_logs がありません。docs/supabase-youtube-api-usage-logs-table.md の SQL を実行してください。'
    );
  } else if (error && error.code !== '42P01') {
    console.error('[youtube-api-usage-log] insert', error.message);
  }
}

