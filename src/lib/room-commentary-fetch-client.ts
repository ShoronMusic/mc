import type { AiSelectionMode } from '@/lib/ai-selection-mode';

export type CommentaryFetchDecisionReason =
  | 'ai_mode_none'
  | 'no_my_client_id'
  | 'poster_self'
  | 'coordinator_absent_poster'
  | 'skip_not_poster'
  | 'skip_poster_absent_not_coordinator';

export type CommentaryFetchDecision = {
  shouldFetch: boolean;
  reason: CommentaryFetchDecisionReason;
};

/**
 * 曲解説 API をこのブラウザが fetch すべきか。
 * 選曲者本人が在室なら選曲者のみ。選曲者不在時のみ協調役が代行（課金は代行者）。
 */
export function evaluateCommentaryFetchClient(params: {
  myClientId: string;
  publisherClientId: string;
  aiMode: AiSelectionMode;
  coordinationClientId: string;
  posterInRoom: boolean;
}): CommentaryFetchDecision {
  if (params.aiMode !== 'full') {
    return { shouldFetch: false, reason: 'ai_mode_none' };
  }
  const me = params.myClientId.trim();
  if (!me) {
    return { shouldFetch: false, reason: 'no_my_client_id' };
  }
  const poster = params.publisherClientId.trim();
  if (poster && poster === me) {
    return { shouldFetch: true, reason: 'poster_self' };
  }
  if (!params.posterInRoom && params.coordinationClientId.trim() === me) {
    return { shouldFetch: true, reason: 'coordinator_absent_poster' };
  }
  if (params.posterInRoom) {
    return { shouldFetch: false, reason: 'skip_not_poster' };
  }
  return { shouldFetch: false, reason: 'skip_poster_absent_not_coordinator' };
}

export function shouldLocalClientFetchSongCommentary(params: {
  myClientId: string;
  publisherClientId: string;
  aiMode: AiSelectionMode;
  coordinationClientId: string;
  posterInRoom: boolean;
}): boolean {
  return evaluateCommentaryFetchClient(params).shouldFetch;
}
