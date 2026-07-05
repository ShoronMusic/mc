/**
 * 同期再生用メッセージ型
 */

export type PlaybackMessageType =
  | 'changeVideo'
  | 'queueSong'
  | 'cancelQueueSong'
  | 'play'
  | 'pause'
  | 'seek'
  /** 遅延入室者向け: いまの再生位置・選曲者・ターンをまとめて送る */
  | 'sync'
  /** 選曲者のみ。全員のプレイヤーを末尾にシークし YT の ended と同等にする */
  | 'skipToEnd';

export interface PlaybackMessage {
  type: PlaybackMessageType;
  videoId?: string;
  currentTime?: number;
  time?: number;
  playing?: boolean;
  /** changeVideo の送信者 clientId（次の曲促しを誰が出すか判定用） */
  publisherClientId?: string;
  /** 選曲者が計算した「次のターン」。受信側は participatingOrder がずれていてもこれを優先する */
  nextTurnClientId?: string;
  /** sync スナップショット用 */
  currentTurnClientId?: string;
  trackStartedAtMs?: number;
  /** 遅延入室 sync 用・選曲ラウンド */
  selectionRoundNumber?: number;
  /** 選曲者の AI モード（full = 解説等あり / none = 選曲のみ）。changeVideo・queueSong で引き継ぐ */
  aiMode?: 'full' | 'none';
  /** queueSong / sync スナップショット: 再接続後も選曲者を特定 */
  publisherAuthUserId?: string;
  publisherDisplayName?: string;
  /** sync スナップショット: 再生中の選曲予約キュー全体 */
  reservationQueue?: ReservationQueueEntryPayload[];
  /** sync スナップショット: 次の選曲ターンで自動パスする参加者 */
  passTurnReservationClientIds?: string[];
}

export type ReservationQueueEntryPayload = {
  videoId: string;
  publisherClientId: string;
  aiMode?: 'full' | 'none';
  publisherAuthUserId?: string;
  publisherDisplayName?: string;
};

/** 後から入室したクライアントが再生状態を問い合わせ */
export const REQUEST_PLAYBACK_SYNC_EVENT = 'room:requestPlaybackSync';
/** 最古入室者が上記に答えて送るスナップショット */
export const PLAYBACK_SNAPSHOT_EVENT = 'room:playbackSnapshot';
/** 視聴履歴が更新されたので、全員が再取得するための通知 */
export const PLAYBACK_HISTORY_UPDATED_EVENT = 'room:playbackHistoryUpdated';

export interface PlaybackHistoryUpdatedPayload {
  videoId?: string;
  at?: number;
}
