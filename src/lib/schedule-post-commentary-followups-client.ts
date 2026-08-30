/**
 * 曲解説テキストが揃った時点でクイズ／おすすめの生成を並行開始し、
 * 表示だけ「解説 → クイズ → おすすめ」の順に合わせる。
 * 間隔は呼び出し側で resolvePostCommentaryPace した結果の staggerMs を渡す。
 */

import { scheduleNextSongRecommendAfterCommentary } from '@/lib/schedule-next-song-recommend-client';
import {
  getPostCommentaryQuizDisplayDelayMs,
  getPostCommentaryRecommendDisplayDelayMs,
  resolvePostCommentaryPace,
} from '@/lib/post-commentary-followup-timing';
import type { SongQuizPayload } from '@/lib/song-quiz-types';

type AddAiMessageFn = (body: string, opts?: Record<string, unknown>) => void;

export function startPostCommentaryFollowups(options: {
  videoId: string;
  roomId?: string;
  commentaryContext: string;
  freeSlotCount: number;
  /** 自由解説間隔。残り時間から逆算した値を渡す */
  staggerMs: number;
  quizEnabled: boolean;
  recommendEnabled: boolean;
  isGuest: boolean;
  aiMode?: 'full' | 'none';
  /** 渡すと staggerMs より優先して逆算し直す */
  remainingPlaybackMs?: number | null;
  aiAgentParticipating?: boolean;
  videoIdRef: { current: string | null };
  registerTimer: (timer: ReturnType<typeof setTimeout>) => void;
  addAiMessage: AddAiMessageFn;
  buildRecommendExtras?: () => Record<string, unknown> | undefined;
  createPendingRecommendCard?: () => string | null;
  clearPendingRecommendCard?: (messageId: string) => void;
  onShowQuiz: (quiz: SongQuizPayload) => void;
}): void {
  const quizWillShow = options.quizEnabled && !options.isGuest;
  const recommendEnabled = options.recommendEnabled === true && !options.isGuest;

  let freeStaggerMs = Math.max(0, options.staggerMs);
  let quizDisplayDelayMs = getPostCommentaryQuizDisplayDelayMs(
    options.freeSlotCount,
    freeStaggerMs,
  );
  let recommendDisplayDelayMs = getPostCommentaryRecommendDisplayDelayMs({
    quizWillShow,
    quizDisplayDelayMs,
  });

  if (options.remainingPlaybackMs !== undefined) {
    const pace = resolvePostCommentaryPace({
      remainingPlaybackMs: options.remainingPlaybackMs,
      freeSlotCount: options.freeSlotCount,
      quizEnabled: quizWillShow,
      recommendEnabled,
      aiAgentParticipating: options.aiAgentParticipating === true,
    });
    freeStaggerMs = pace.freeStaggerMs;
    quizDisplayDelayMs = pace.quizDisplayDelayMs;
    recommendDisplayDelayMs = pace.recommendDisplayDelayMs;
  }

  if (quizWillShow) {
    let quiz: SongQuizPayload | null = null;
    let gateOpen = false;
    let shown = false;
    const tryShow = () => {
      if (shown) return;
      if (options.videoIdRef.current !== options.videoId) {
        // 次曲が始まったら捨てる（遅延表示しない）
        shown = true;
        quiz = null;
        return;
      }
      if (!gateOpen || !quiz) return;
      shown = true;
      options.onShowQuiz(quiz);
    };
    void fetch('/api/ai/song-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        videoId: options.videoId,
        roomId: options.roomId ?? '',
        aiMode: options.aiMode ?? 'full',
        isGuest: options.isGuest === true,
        commentaryContext: options.commentaryContext,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { quiz?: SongQuizPayload | null } | null) => {
        if (!res?.quiz) return;
        quiz = res.quiz;
        tryShow();
      })
      .catch(() => {});
    const quizTimer = setTimeout(() => {
      gateOpen = true;
      tryShow();
    }, quizDisplayDelayMs);
    options.registerTimer(quizTimer);
  }

  if (recommendEnabled) {
    scheduleNextSongRecommendAfterCommentary({
      videoId: options.videoId,
      roomId: options.roomId,
      songQuizDelayMs: 0,
      preferFastAfterQuiz: true,
      displayAfterMs: recommendDisplayDelayMs,
      commentarySnippet: options.commentaryContext,
      isGuest: options.isGuest,
      aiMode: options.aiMode,
      videoIdRef: options.videoIdRef,
      registerTimer: options.registerTimer,
      addAiMessage: options.addAiMessage,
      buildAddAiMessageExtras: options.buildRecommendExtras,
      createPendingCard: options.createPendingRecommendCard,
      clearPendingCard: options.clearPendingRecommendCard,
    });
  }
}
