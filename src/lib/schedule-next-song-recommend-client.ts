/**
 * 「次に聴くなら」を POST し、有効時だけ AI 発言を追加する。
 * 生成は即開始し、表示は displayAfterMs に合わせる（曲解説・クイズと並行生成）。
 * @see docs/next-song-recommend-beta-spec.md
 */

import type { NextSongPick } from '@/lib/next-song-recommend-generate';
import { buildNextRecommendUiLabel } from '@/lib/chat-message-ui-labels';

/** おすすめ3件の表示を段階的に出す間隔（ミリ秒） */
const NEXT_SONG_RECOMMEND_STAGGER_MS = 900;

/** @deprecated 生成開始遅延は使わない。表示遅延は displayAfterMs。 */
export function getNextSongRecommendScheduleDelayMs(
  _songQuizDelayMs: number,
  _preferFastAfterQuiz?: boolean,
): number {
  return 0;
}

function formatPickMessage(pick: NextSongPick, index: number, total: number): string {
  const sourceLabel = pick.source === 'db' ? '[DB] ' : '[NEW] ';
  const aiLabel = buildNextRecommendUiLabel(index + 1);
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

function isValidPick(p: NextSongPick): boolean {
  return Boolean(
    p &&
      typeof p.artist === 'string' &&
      typeof p.title === 'string' &&
      typeof p.reason === 'string' &&
      typeof p.youtubeSearchQuery === 'string',
  );
}

type AddAiMessageFn = (body: string, opts?: Record<string, unknown>) => void;

/**
 * @param songQuizDelayMs 互換のため残す（生成開始には使わない）
 * @param displayAfterMs 生成完了後も、この時刻まで表示を遅らせる
 */
export function scheduleNextSongRecommendAfterCommentary(options: {
  videoId: string;
  roomId?: string;
  songQuizDelayMs: number;
  isGuest: boolean;
  videoIdRef: { current: string | null };
  registerTimer: (timer: ReturnType<typeof setTimeout>) => void;
  addAiMessage: AddAiMessageFn;
  addAiMessageExtras?: Record<string, unknown>;
  buildAddAiMessageExtras?: () => Record<string, unknown> | undefined;
  preferFastAfterQuiz?: boolean;
  allowAfterVideoChange?: boolean;
  /** true のとき表示待ちタイマーは曲スキップで消さない */
  persistDisplayTimer?: boolean;
  aiMode?: 'full' | 'none';
  createPendingCard?: () => string | null;
  clearPendingCard?: (messageId: string) => void;
  displayAfterMs?: number;
  commentarySnippet?: string;
}): void {
  if (options.isGuest) return;
  if (options.aiMode === 'none') return;

  const displayAfterMs = Math.max(0, options.displayAfterMs ?? 0);
  let pendingMessageId: string | null = null;
  let displayGateOpen = displayAfterMs <= 0;
  let fetchDone = false;
  let picks: NextSongPick[] | null = null;
  let emitted = false;

  const clearPending = () => {
    if (pendingMessageId) options.clearPendingCard?.(pendingMessageId);
    pendingMessageId = null;
  };

  const emitPicks = (ready: NextSongPick[]) => {
    if (emitted) return;
    emitted = true;
    clearPending();
    ready.forEach((pick, idx) => {
      const emit = () => {
        if (!options.allowAfterVideoChange && options.videoIdRef.current !== options.videoId) return;
        const dynamicExtras = options.buildAddAiMessageExtras?.() ?? {};
        const catalog = pick.catalog;
        options.addAiMessage(formatPickMessage(pick, idx, ready.length), {
          videoId: options.videoId,
          aiSource: 'next_song_recommend',
          recommendationId:
            typeof pick.recommendationId === 'string' && pick.recommendationId.trim()
              ? pick.recommendationId.trim()
              : null,
          ...(catalog?.watchUrl && catalog.videoId
            ? {
                nextSongRecommendCatalog: {
                  inMcDb: Boolean(catalog.inMcDb),
                  inMusic8: Boolean(catalog.inMusic8),
                  songId: catalog.songId ?? null,
                  videoId: catalog.videoId,
                  watchUrl: catalog.watchUrl,
                  dbMainArtist: catalog.dbMainArtist ?? null,
                  dbSongTitle: catalog.dbSongTitle ?? null,
                  dbDisplayTitle: catalog.dbDisplayTitle ?? null,
                },
              }
            : {}),
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
  };

  const tryFlush = () => {
    if (
      !options.allowAfterVideoChange &&
      options.videoIdRef.current !== options.videoId
    ) {
      clearPending();
      return;
    }
    if (!displayGateOpen) return;
    if (!fetchDone) {
      if (!pendingMessageId) pendingMessageId = options.createPendingCard?.() ?? null;
      return;
    }
    if (!picks || picks.length === 0) {
      clearPending();
      return;
    }
    emitPicks(picks);
  };

  void fetch('/api/ai/next-song-recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      videoId: options.videoId,
      roomId: options.roomId ?? '',
      aiMode: options.aiMode ?? 'full',
      isGuest: false,
      commentarySnippet: (options.commentarySnippet ?? '').slice(0, 2000),
    }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { enabled?: unknown; picks?: unknown } | null) => {
      fetchDone = true;
      if (!data || data.enabled !== true || !Array.isArray(data.picks) || data.picks.length === 0) {
        picks = null;
        tryFlush();
        return;
      }
      const next = data.picks as NextSongPick[];
      picks = next.every(isValidPick) ? next : null;
      tryFlush();
    })
    .catch(() => {
      fetchDone = true;
      picks = null;
      tryFlush();
    });

  if (displayAfterMs <= 0) {
    tryFlush();
    return;
  }
  const gateTimer = setTimeout(() => {
    displayGateOpen = true;
    tryFlush();
  }, displayAfterMs);
  if (!options.persistDisplayTimer) options.registerTimer(gateTimer);
}
