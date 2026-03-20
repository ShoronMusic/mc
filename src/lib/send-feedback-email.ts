/**
 * 詳細フィードバックを reeshoron@gmail.com にメール送信する。
 * RESEND_API_KEY が未設定の場合は送信せず undefined を返す。
 */

/** 未設定時は既定の通知先（.env で上書き可） */
function getFeedbackTo(): string {
  const v = process.env.FEEDBACK_TO_EMAIL;
  return typeof v === 'string' && v.trim() ? v.trim() : 'reeshoron@gmail.com';
}

export type DetailFeedbackPayload = {
  isDuplicate: boolean;
  isDubious: boolean;
  isAmbiguous: boolean;
  freeComment: string;
};

export type FeedbackEmailContext = {
  aiMessageId: string;
  commentBody: string;
  videoId: string | null;
  songId: string | null;
  source: string;
  /** ログイン済みなら Supabase Auth の user id。ゲストは null */
  userId?: string | null;
  detail: DetailFeedbackPayload;
};

export type SendFeedbackEmailResult =
  | { ok: true }
  | { ok: false; error: string; code: 'missing_api_key' | 'send_failed' };

export async function sendFeedbackEmail(ctx: FeedbackEmailContext): Promise<SendFeedbackEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? 'onboarding@resend.dev';

  if (!apiKey || !apiKey.trim()) {
    return { ok: false, error: 'RESEND_API_KEY is not set', code: 'missing_api_key' };
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    const lines: string[] = [
      '【AIコメント詳細フィードバック】',
      '',
      `AIメッセージID: ${ctx.aiMessageId}`,
      `動画ID: ${ctx.videoId ?? '（なし）'}`,
      `曲ID: ${ctx.songId ?? '（なし）'}`,
      `ソース: ${ctx.source}`,
      `送信ユーザー: ${ctx.userId && ctx.userId.trim() ? ctx.userId : 'ゲスト（未ログイン）'}`,
      '',
      '--- 対象コメント ---',
      ctx.commentBody.slice(0, 2000) + (ctx.commentBody.length > 2000 ? '...' : ''),
      '',
      '--- フィードバック ---',
      `コメント内容が重複: ${ctx.detail.isDuplicate ? 'はい' : 'いいえ'}`,
      `コメント内容の真偽が怪しい: ${ctx.detail.isDubious ? 'はい' : 'いいえ'}`,
      `コメント内容が曖昧・ありきたり（正誤はないが陳腐）: ${ctx.detail.isAmbiguous ? 'はい' : 'いいえ'}`,
      '',
      '自由コメント:',
      ctx.detail.freeComment || '（未記入）',
    ];

    const to = getFeedbackTo();

    const { error } = await resend.emails.send({
      from,
      to,
      subject: `[洋楽AIチャット] AIコメント詳細フィードバック - ${ctx.aiMessageId.slice(0, 8)}`,
      text: lines.join('\n'),
    });

    if (error) {
      return {
        ok: false,
        error: String(error.message ?? error),
        code: 'send_failed',
      };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, code: 'send_failed' };
  }
}
