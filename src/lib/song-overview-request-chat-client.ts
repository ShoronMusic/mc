import { SONG_OVERVIEW_REQUEST_PROMPT } from '@/lib/song-overview-request';

export type SongOverviewChatMessage = {
  displayName?: string;
  body: string;
  messageType: string;
};

export type RequestSongOverviewChatResult =
  | { ok: true; text: string }
  | { ok: false; message: string };

const DEFAULT_ERROR =
  'AI が応答できませんでした。.env.local に GEMINI_API_KEY を設定し、開発サーバーを再起動してください。';

/**
 * エージェント選曲アナウンスの「概要を聞く」から /api/ai/chat を呼ぶ（@1回・クレジット消費）。
 * ユーザーの発言はチャットに載せず、API 用の文脈だけにプロンプトを足す。
 */
export async function requestSongOverviewChat(params: {
  messages: readonly SongOverviewChatMessage[];
  videoId: string;
  roomId?: string;
  isGuest: boolean;
  userDisplayName: string;
}): Promise<RequestSongOverviewChatResult> {
  const listForAi = [
    ...params.messages.map((m) => ({
      displayName: m.displayName,
      body: m.body,
      messageType: m.messageType,
    })),
    {
      displayName: params.userDisplayName,
      body: SONG_OVERVIEW_REQUEST_PROMPT,
      messageType: 'user',
    },
  ];

  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: listForAi,
      videoId: params.videoId,
      roomId: params.roomId,
      isGuest: params.isGuest,
      forceReply: true,
    }),
  });

  const data = (await res.json().catch(() => null)) as {
    text?: string;
    skipped?: boolean;
    error?: string;
    message?: string;
  } | null;

  if (res.status === 429 && data?.error === 'rate_limit') {
    return {
      ok: false,
      message:
        typeof data.message === 'string' && data.message.trim()
          ? data.message.trim()
          : 'AI への質問が短時間に集中しています。しばらく待ってから再度お試しください。',
    };
  }

  if (res.status === 403 && data?.error === 'guest_ai_unavailable') {
    return {
      ok: false,
      message:
        typeof data.message === 'string' && data.message.trim()
          ? data.message.trim()
          : 'ゲストの方は @ への質問はご利用いただけません。ユーザー登録後にお試しください。',
    };
  }

  if (
    res.status === 403 &&
    typeof data?.message === 'string' &&
    data.message.trim() &&
    (data.error === 'at_trial_exhausted' ||
      data.error === 'trial_exhausted' ||
      data.error === 'credits_exhausted' ||
      data.error === 'email_unconfirmed' ||
      data.error === 'ai_trial_login_required')
  ) {
    return { ok: false, message: data.message.trim() };
  }

  if (!res.ok) {
    return { ok: false, message: DEFAULT_ERROR };
  }

  if (data?.text && typeof data.text === 'string' && data.text.trim()) {
    return { ok: true, text: data.text.trim() };
  }

  if (data?.skipped === true) {
    return { ok: false, message: 'AI が応答しませんでした。' };
  }

  return { ok: false, message: DEFAULT_ERROR };
}
