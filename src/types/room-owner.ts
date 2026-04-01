/**
 * オーナー権限で送るチャネルメッセージ
 */

export const OWNER_FORCE_EXIT_EVENT = 'owner:forceExit';
export const OWNER_AI_FREE_SPEECH_STOP_EVENT = 'owner:aiFreeSpeechStop';
export const OWNER_STATE_EVENT = 'owner:state';

export interface OwnerForceExitPayload {
  targetClientId: string;
  targetDisplayName: string;
}

export interface OwnerAiFreeSpeechStopPayload {
  enabled: boolean;
}

/** オーナー状態の同期（誰がオーナーか・退出時刻） */
export interface OwnerStatePayload {
  ownerClientId: string;
  ownerLeftAt: number | null;
}

/** 選曲順の同期（今誰の番か）。そのルームのセッションのみ */
export const TURN_STATE_EVENT = 'room:turnState';

export interface TurnStatePayload {
  currentTurnClientId: string;
}

/** オーナーによる5分制限のON/OFF。そのルームのセッションのみ。デフォルトON */
export const OWNER_5MIN_LIMIT_EVENT = 'owner:5minLimit';

export interface Owner5MinLimitPayload {
  enabled: boolean;
}

/** オーナーによる曲紹介コメント本数設定（そのルームのセッションのみ） */
export const OWNER_COMMENT_PACK_MODE_EVENT = 'owner:commentPackMode';

export type OwnerCommentPackMode = 'full' | 'base_only' | 'off';

export interface OwnerCommentPackModePayload {
  mode: OwnerCommentPackMode;
}

/** オーナーによる「邦楽AI解説の解禁」設定（そのルームのセッションのみ）。デフォルトOFF */
export const OWNER_JP_AI_UNLOCK_EVENT = 'owner:jpAiUnlock';

export interface OwnerJpAiUnlockPayload {
  enabled: boolean;
}

/** @ 付きAI質問のガード警告・カード同期 */
export const OWNER_AI_QUESTION_GUARD_EVENT = 'owner:aiQuestionGuard';

export interface OwnerAiQuestionGuardPayload {
  targetClientId: string;
  targetDisplayName: string;
  warningCount: number;
  yellowCards: number;
  action: 'warn' | 'yellow' | 'ban';
  message: string;
}
