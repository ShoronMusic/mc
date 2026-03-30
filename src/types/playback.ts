/**
 * 同期再生用メッセージ型
 */

export type PlaybackMessageType =
  | 'changeVideo'
  | 'queueSong'
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
  /** sync スナップショット用 */
  currentTurnClientId?: string;
  trackStartedAtMs?: number;
}

/** 後から入室したクライアントが再生状態を問い合わせ */
export const REQUEST_PLAYBACK_SYNC_EVENT = 'room:requestPlaybackSync';
/** 最古入室者が上記に答えて送るスナップショット */
export const PLAYBACK_SNAPSHOT_EVENT = 'room:playbackSnapshot';
