/**
 * /api/ai/* 失敗時のシステムメッセージ（「キー未設定」を一律に出さない）
 */

export const AI_CHAT_GEMINI_KEY_HINT =
  'AI が応答できませんでした。.env.local に GEMINI_API_KEY を設定し、開発サーバーを再起動してください。';

export const AI_CHAT_GENERIC_FAILURE =
  'AI が応答できませんでした。時間をおいて再度お試しください。';

export function resolveAiChatClientErrorMessage(
  data: { error?: string; message?: string } | null | undefined,
  httpStatus?: number,
): string {
  const serverMsg = typeof data?.message === 'string' ? data.message.trim() : '';
  if (serverMsg) return serverMsg;

  const err = typeof data?.error === 'string' ? data.error.trim() : '';
  if (err === 'gemini_not_configured' || err === 'AI is not configured or failed to generate a reply.') {
    return AI_CHAT_GEMINI_KEY_HINT;
  }
  if (err === 'ai_budget_halted') {
    return 'AI の月次予算上限に達したため、一時停止しています。';
  }
  if (err === 'generation_failed' || err === 'Server error') {
    return AI_CHAT_GENERIC_FAILURE;
  }
  if (httpStatus === 503 && !err) return AI_CHAT_GENERIC_FAILURE;
  return AI_CHAT_GENERIC_FAILURE;
}
