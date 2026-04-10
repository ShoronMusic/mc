/**
 * 詳細フィードバック・サイトご意見を Resend 経由で通知する。
 * RESEND_API_KEY が未設定の場合は送信せず失敗結果を返す。
 */

const DEFAULT_FEEDBACK_RECIPIENTS = ['reeshoron@gmail.com', 'ymap68@yahoo.co.jp'] as const;

/** カンマ区切りで複数指定可。未設定時は既定の通知先一覧 */
function getFeedbackRecipients(): string[] {
  const v = process.env.FEEDBACK_TO_EMAIL;
  if (typeof v === 'string' && v.trim()) {
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [...DEFAULT_FEEDBACK_RECIPIENTS];
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

export type SiteFeedbackEmailContext = {
  rating: number;
  comment: string | null;
  roomId: string | null;
  displayName: string | null;
  isGuest: boolean;
  userId: string | null;
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

    const to = getFeedbackRecipients();

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

export async function sendSiteFeedbackEmail(
  ctx: SiteFeedbackEmailContext,
): Promise<SendFeedbackEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? 'onboarding@resend.dev';

  if (!apiKey || !apiKey.trim()) {
    return { ok: false, error: 'RESEND_API_KEY is not set', code: 'missing_api_key' };
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    const lines: string[] = [
      '【サイトへのご意見】',
      '',
      `評価: ${ctx.rating}（-2 〜 2）`,
      `部屋ID: ${ctx.roomId ?? '（なし）'}`,
      `表示名: ${ctx.displayName ?? '（なし）'}`,
      `ログイン: ${ctx.isGuest ? 'ゲスト' : 'ログイン済み'}`,
      `ユーザーID: ${ctx.userId && ctx.userId.trim() ? ctx.userId : '（なし）'}`,
      '',
      '--- 自由コメント ---',
      ctx.comment && ctx.comment.trim() ? ctx.comment.trim() : '（未記入）',
    ];

    const to = getFeedbackRecipients();

    const { error } = await resend.emails.send({
      from,
      to,
      subject: `[洋楽AIチャット] サイトへのご意見（評価 ${ctx.rating}）`,
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
