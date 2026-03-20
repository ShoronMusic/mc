/**
 * 同期再生用メッセージ型
 */

export type PlaybackMessageType =
  | 'changeVideo'
  | 'play'
  | 'pause'
  | 'seek'
  | 'sync';

export interface PlaybackMessage {
  type: PlaybackMessageType;
  videoId?: string;
  currentTime?: number;
  time?: number;
  playing?: boolean;
  /** changeVideo の送信者 clientId（次の曲促しを誰が出すか判定用） */
  publisherClientId?: string;
}
