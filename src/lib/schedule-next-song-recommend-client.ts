/**
 * 曲解説表示後に「次に聴くなら」を POST し、有効時だけ AI 発言を追加する。
 * 三択クイズの API と重なりにくいよう、曲解説からの遅延はクイズより長めに取る。
 * @see docs/next-song-recommend-beta-spec.md
 */

import type { NextSongPick } from '@/lib/next-song-recommend-generate';

/** クイズ fetch 遅延より後ろにずらすオフセット（ミリ秒） */
const AFTER_COMMENTARY_EXTRA_MS = 4500;
/** クイズ出題後におすすめを素早く出す短縮オフセット（ミリ秒） */
const AFTER_QUIZ_FAST_EXTRA_MS = 0;
/** おすすめ3件の表示を段階的に出す間隔（ミリ秒） */
const NEXT_SONG_RECOMMEND_STAGGER_MS = 900;

export function getNextSongRecommendScheduleDelayMs(
  songQuizDelayMs: number,
  preferFastAfterQuiz?: boolean,
): number {
  return songQuizDelayMs + (preferFastAfterQuiz ? AFTER_QUIZ_FAST_EXTRA_MS : AFTER_COMMENTARY_EXTRA_MS);
}

function formatPickMessage(pick: NextSongPick, index: number, total: number): string {
  const sourceLabel = pick.source === 'db' ? '[DB] ' : '[NEW] ';
  const aiLabel = `【AIオススメ${String(index + 1).padStart(2, '0')}】`;
  const numberedHead = `${sourceLabel}${index + 1}/${total} ♪ ${pick.artist}「${pick.title}」`;
  const head =
    index === 0
      ? `${aiLabel} 【次に聴くなら（試験）】 ${numberedHead}`
      : `${aiLabel} ${numberedHead}`;
  const normalizedQuery = `${pick.artist} - ${pick.title} (official video)`;
  const sub = [pick.reason, normalizedQuery ? `【キーワード】 ${normalizedQuery}` : '']
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
  /** 送信直前に追加オプションを決める（次曲案内後の遅延パネル送り判定など） */
  buildAddAiMessageExtras?: () => Record<string, unknown> | undefined;
  /** 三択クイズ出題後は待ち時間を短縮しておすすめを出す */
  preferFastAfterQuiz?: boolean;
  /** 曲が切り替わっても前曲のおすすめを遅延表示へ回して出す */
  allowAfterVideoChange?: boolean;
  /** 生成中カードを表示して messageId を返す */
  createPendingCard?: () => string | null;
  /** 生成中カードを消す */
  clearPendingCard?: (messageId: string) => void;
}): void {
  if (options.isGuest) return;
  const pendingMessageId = options.createPendingCard?.() ?? null;
  const clearPending = () => {
    if (pendingMessageId) options.clearPendingCard?.(pendingMessageId);
  };

  const delayMs = getNextSongRecommendScheduleDelayMs(
    options.songQuizDelayMs,
    options.preferFastAfterQuiz,
  );
  const timer = setTimeout(() => {
    if (!options.allowAfterVideoChange && options.videoIdRef.current !== options.videoId) return;
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
        if (!options.allowAfterVideoChange && options.videoIdRef.current !== options.videoId) {
          clearPending();
          return;
        }
        if (!data || data.enabled !== true || !Array.isArray(data.picks) || data.picks.length === 0) {
          clearPending();
          return;
        }
        const picks = data.picks as NextSongPick[];
        const ok = picks.every(
          (p) =>
            p &&
            typeof p.artist === 'string' &&
            typeof p.title === 'string' &&
            typeof p.reason === 'string' &&
            typeof p.youtubeSearchQuery === 'string',
        );
        if (!ok) {
          clearPending();
          return;
        }
        clearPending();
        picks.forEach((pick, idx) => {
          const emit = () => {
            if (!options.allowAfterVideoChange && options.videoIdRef.current !== options.videoId) return;
            const dynamicExtras = options.buildAddAiMessageExtras?.() ?? {};
            options.addAiMessage(formatPickMessage(pick, idx, picks.length), {
              videoId: options.videoId,
              aiSource: 'next_song_recommend',
              recommendationId:
                typeof pick.recommendationId === 'string' && pick.recommendationId.trim()
                  ? pick.recommendationId.trim()
                  : null,
              ...(options.addAiMessageExtras ?? {}),
              ...dynamicExtras,
            });
          };
          if (idx === 0) {
            emit();
            return;
          }
          const staggerTimer = setTimeout(emit, idx * NEXT_SONG_RECOMMEND_STAGGER_MS);
          options.registerTimer(staggerTimer);
        });
      })
      .catch(() => {
        clearPending();
      });
  }, delayMs);
  options.registerTimer(timer);
}
