/**
 * 曲解説表示後に「次に聴くなら」を POST し、有効時だけ AI 発言を追加する。
 * 三択クイズの API と重なりにくいよう、曲解説からの遅延はクイズより長めに取る。
 * @see docs/next-song-recommend-beta-spec.md
 */

import type { NextSongPick } from '@/lib/next-song-recommend-generate';

/** クイズ fetch 遅延より後ろにずらすオフセット（ミリ秒） */
const AFTER_COMMENTARY_EXTRA_MS = 4500;

export function getNextSongRecommendScheduleDelayMs(songQuizDelayMs: number): number {
  return songQuizDelayMs + AFTER_COMMENTARY_EXTRA_MS;
}

function formatPickMessage(pick: NextSongPick, index: number, total: number): string {
  const sourceLabel = pick.source === 'db' ? '[DB] ' : '[NEW] ';
  const head =
    index === 0
      ? `【次に聴くなら（試験）】 ${sourceLabel}${index + 1}/${total} ${pick.artist}「${pick.title}」`
      : `${sourceLabel}${index + 1}/${total} ${pick.artist}「${pick.title}」`;
  const sub = [pick.reason, pick.youtubeSearchQuery ? `検索: ${pick.youtubeSearchQuery}` : '']
    .filter(Boolean)
    .join(' ');
  return sub ? `${head}\n　${sub}` : head;
}

type AddAiMessageFn = (body: string, opts?: Record<string, unknown>) => void;

/**
 * @param songQuizDelayMs 当該フローでの三択クイズ用 setTimeout と同じ基準遅延（曲解説直後からの ms）
 */
export function scheduleNextSongRecommendAfterCommentary(options: {
  videoId: string;
  roomId?: string;
  songQuizDelayMs: number;
  isGuest: boolean;
  videoIdRef: { current: string | null };
  registerTimer: (timer: ReturnType<typeof setTimeout>) => void;
  addAiMessage: AddAiMessageFn;
  /** 同期部屋では AI 発言停止中でも出すため true */
  addAiMessageExtras?: Record<string, unknown>;
}): void {
  if (options.isGuest) return;

  const delayMs = getNextSongRecommendScheduleDelayMs(options.songQuizDelayMs);
  const timer = setTimeout(() => {
    if (options.videoIdRef.current !== options.videoId) return;
    void fetch('/api/ai/next-song-recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        videoId: options.videoId,
        roomId: options.roomId ?? '',
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { enabled?: unknown; picks?: unknown } | null) => {
        if (options.videoIdRef.current !== options.videoId) return;
        if (!data || data.enabled !== true || !Array.isArray(data.picks) || data.picks.length === 0) return;
        const picks = data.picks as NextSongPick[];
        const ok = picks.every(
          (p) =>
            p &&
            typeof p.artist === 'string' &&
            typeof p.title === 'string' &&
            typeof p.reason === 'string' &&
            typeof p.youtubeSearchQuery === 'string',
        );
        if (!ok) return;
        picks.forEach((pick, idx) => {
          options.addAiMessage(formatPickMessage(pick, idx, picks.length), {
            videoId: options.videoId,
            aiSource: 'next_song_recommend',
            recommendationId:
              typeof pick.recommendationId === 'string' && pick.recommendationId.trim()
                ? pick.recommendationId.trim()
                : null,
            ...(options.addAiMessageExtras ?? {}),
          });
        });
      });
  }, delayMs);
  options.registerTimer(timer);
}
