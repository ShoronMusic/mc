/**
 * 曲の残り時間と後続（自由解説・クイズ・おすすめ・エージェント）から、
 * 自由解説の間隔とクイズ／おすすめの表示時刻を逆算する。
 */

/** 理想の自由解説間隔（読みやすさ優先） */
export const COMMENT_PACK_FREE_STAGGER_IDEAL_MS = 30_000;
/** 間に合わせるときの下限（これ未満だと読めない） */
export const COMMENT_PACK_FREE_STAGGER_MIN_MS = 8_000;

/** 最後の自由解説のあと、クイズ（またはおすすめ）を出すまでの余白 */
export const POST_COMMENTARY_QUIZ_GAP_MS = 3500;
/** クイズ表示のあと、おすすめを出すまでの余白 */
export const POST_QUIZ_RECOMMEND_GAP_MS = 1200;

/** おすすめ3件が出揃う／読めるまでの余白 */
const RECOMMEND_SHOW_TAIL_MS = 4000;
/** クイズだけ出すときの余白（回答まで含めない・表示確認用） */
const QUIZ_SHOW_TAIL_MS = 5000;
/** エージェント参加時: 次曲選曲に食い込まない終端バッファ */
const END_BUFFER_WITH_AI_AGENT_MS = 22_000;
/** エージェントなし: 曲終了直前の余白 */
const END_BUFFER_DEFAULT_MS = 10_000;

export type PostCommentaryPaceInput = {
  /** 再生位置から曲終了までの残り。不明なら null（理想間隔のまま） */
  remainingPlaybackMs: number | null;
  freeSlotCount: number;
  quizEnabled: boolean;
  recommendEnabled: boolean;
  aiAgentParticipating: boolean;
};

export type PostCommentaryPace = {
  freeStaggerMs: number;
  quizDisplayDelayMs: number;
  recommendDisplayDelayMs: number;
  /** 理想間隔より短く詰めたか */
  compressed: boolean;
};

export function getPostCommentaryQuizDisplayDelayMs(
  freeSlotCount: number,
  staggerMs: number,
): number {
  const n = Number.isFinite(freeSlotCount) ? Math.max(0, Math.floor(freeSlotCount)) : 0;
  const stagger = Number.isFinite(staggerMs) ? Math.max(0, staggerMs) : 0;
  return n * stagger + POST_COMMENTARY_QUIZ_GAP_MS;
}

export function getPostCommentaryRecommendDisplayDelayMs(opts: {
  quizWillShow: boolean;
  quizDisplayDelayMs: number;
}): number {
  const quizAt = Math.max(0, opts.quizDisplayDelayMs);
  if (opts.quizWillShow) return quizAt + POST_QUIZ_RECOMMEND_GAP_MS;
  return quizAt;
}

/** 最後の自由解説表示以降に必要な固定時間（間隔以外） */
export function getPostCommentaryFixedTailMs(opts: {
  quizEnabled: boolean;
  recommendEnabled: boolean;
}): number {
  let tail = POST_COMMENTARY_QUIZ_GAP_MS;
  if (opts.quizEnabled && opts.recommendEnabled) {
    tail += POST_QUIZ_RECOMMEND_GAP_MS + RECOMMEND_SHOW_TAIL_MS;
  } else if (opts.recommendEnabled) {
    tail += RECOMMEND_SHOW_TAIL_MS;
  } else if (opts.quizEnabled) {
    tail += QUIZ_SHOW_TAIL_MS;
  }
  return tail;
}

export function getPostCommentaryEndBufferMs(aiAgentParticipating: boolean): number {
  return aiAgentParticipating ? END_BUFFER_WITH_AI_AGENT_MS : END_BUFFER_DEFAULT_MS;
}

/**
 * 残り時間に収まるよう自由解説間隔を決める。
 * 収まりきらない場合も MIN まで縮めて最善を尽くす（表示自体は止めない）。
 */
export function resolvePostCommentaryPace(input: PostCommentaryPaceInput): PostCommentaryPace {
  const freeSlotCount = Number.isFinite(input.freeSlotCount)
    ? Math.max(0, Math.floor(input.freeSlotCount))
    : 0;
  const quizEnabled = input.quizEnabled === true;
  const recommendEnabled = input.recommendEnabled === true;
  const fixedTail = getPostCommentaryFixedTailMs({ quizEnabled, recommendEnabled });
  const endBuffer = getPostCommentaryEndBufferMs(input.aiAgentParticipating === true);

  let freeStaggerMs = COMMENT_PACK_FREE_STAGGER_IDEAL_MS;
  let compressed = false;

  const remaining =
    typeof input.remainingPlaybackMs === 'number' && Number.isFinite(input.remainingPlaybackMs)
      ? Math.max(0, input.remainingPlaybackMs)
      : null;

  if (remaining != null && freeSlotCount > 0) {
    const available = Math.max(0, remaining - endBuffer);
    const budgetForStaggers = available - fixedTail;
    if (budgetForStaggers <= 0) {
      freeStaggerMs = COMMENT_PACK_FREE_STAGGER_MIN_MS;
      compressed = true;
    } else {
      const raw = Math.floor(budgetForStaggers / freeSlotCount);
      if (raw < COMMENT_PACK_FREE_STAGGER_IDEAL_MS) {
        freeStaggerMs = Math.max(COMMENT_PACK_FREE_STAGGER_MIN_MS, raw);
        compressed = freeStaggerMs < COMMENT_PACK_FREE_STAGGER_IDEAL_MS;
      }
    }
  }

  const quizDisplayDelayMs = getPostCommentaryQuizDisplayDelayMs(freeSlotCount, freeStaggerMs);
  const recommendDisplayDelayMs = getPostCommentaryRecommendDisplayDelayMs({
    quizWillShow: quizEnabled,
    quizDisplayDelayMs,
  });

  return {
    freeStaggerMs,
    quizDisplayDelayMs,
    recommendDisplayDelayMs,
    compressed,
  };
}

/** YouTube プレイヤーから残り再生ミリ秒を取る（失敗時 null） */
export function readRemainingPlaybackMsFromPlayer(player: {
  getCurrentTime?: () => number;
  getDuration?: () => number;
} | null | undefined): number | null {
  if (!player) return null;
  let currentTime = 0;
  let duration = 0;
  try {
    currentTime = player.getCurrentTime?.() ?? 0;
  } catch {
    return null;
  }
  try {
    duration = player.getDuration?.() ?? 0;
  } catch {
    return null;
  }
  if (!(duration > 1) || !Number.isFinite(duration) || !Number.isFinite(currentTime)) return null;
  const leftSec = duration - Math.max(0, currentTime);
  if (!(leftSec > 0.5)) return 0;
  return Math.floor(leftSec * 1000);
}
