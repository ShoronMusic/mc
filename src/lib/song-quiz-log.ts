/**
 * 曲解説コンテキストに紐づく三択クイズを 1 生成ごとに DB 保存（曲引き・監査用）
 */

import { createHash } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import type { SongQuizPayload } from '@/lib/song-quiz-types';

let missingTableLogged = false;

export function sha256HexUtf8(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * `SONG_QUIZ_LOG_PERSIST=0` で無効化。`SUPABASE_SERVICE_ROLE_KEY` が無いときは何もしない。
 */
export async function insertSongQuizLog(params: {
  videoId: string;
  roomId?: string | null;
  commentaryContext: string;
  quiz: SongQuizPayload;
}): Promise<void> {
  if (process.env.SONG_QUIZ_LOG_PERSIST === '0') return;
  const admin = createAdminClient();
  if (!admin) return;

  const vid = params.videoId.trim();
  if (!vid) return;

  const ctx = params.commentaryContext.trim();
  const preview = ctx.slice(0, 400) || null;
  const hash = ctx ? sha256HexUtf8(ctx) : sha256HexUtf8(JSON.stringify(params.quiz));

  const { error } = await admin.from('song_quiz_logs').insert({
    video_id: vid,
    room_id: params.roomId?.trim() || null,
    commentary_context_sha256: hash,
    commentary_context_preview: preview,
    quiz: params.quiz as unknown as Record<string, unknown>,
  });

  if (error?.code === '42P01') {
    if (!missingTableLogged) {
      missingTableLogged = true;
      console.warn(
        '[song-quiz-log] テーブル song_quiz_logs がありません。docs/supabase-setup.md の song_quiz_logs 章の SQL を実行してください。',
      );
    }
    return;
  }
  if (error) {
    console.error('[song-quiz-log] insert', error.message);
  }
}
