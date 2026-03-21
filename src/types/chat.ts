/**
 * チャットメッセージ・ルームまわりの型
 */

export type MessageType = 'user' | 'ai' | 'system';

export interface ChatMessage {
  id: string;
  sessionId?: string;
  messageType: MessageType;
  userId?: string;
  guestId?: string;
  displayName?: string;
  body: string;
  createdAt: string;
  /** 曲が見つからなかったときの検索用（アーティスト名 - 曲名）。あるときは検索ボタンを表示 */
  searchQuery?: string;
  /** 送信者の clientId（発言色の照合用） */
  clientId?: string;
  /** AIコメントに紐づく曲ID（曲単位の評価用） */
  songId?: string | null;
  /** AIコメントに紐づく videoId（どの動画で出たか） */
  videoId?: string | null;
  /** AIコメントの種別（曲解説 / 豆知識 / 通常応答など） */
  aiSource?: 'commentary' | 'tidbit' | 'chat_reply' | 'other';
  /** song_tidbits の行ID（comment-pack 由来のみ。モデレーターNG用） */
  tidbitId?: string | null;
  /** モデレーターがNGを押しライブラリから無効化済み（ローカル表示用） */
  tidbitLibraryRejected?: boolean;
}

/** Ably で送るチャットイベントのペイロード */
export const CHAT_MESSAGE_EVENT = 'chat:message';

export interface ChatMessagePayload {
  id: string;
  body: string;
  displayName: string;
  messageType: MessageType;
  createdAt: string;
  /** 送信者の clientId（パス判定・ターン管理用） */
  clientId?: string;
  /** AIコメントに紐づく曲ID（曲単位の評価用） */
  songId?: string | null;
  /** AIコメントに紐づく videoId（どの動画で出たか） */
  videoId?: string | null;
  /** AIコメントの種別（曲解説 / 豆知識 / 通常応答など） */
  aiSource?: 'commentary' | 'tidbit' | 'chat_reply' | 'other';
  /** song_tidbits の行ID（comment-pack 由来） */
  tidbitId?: string | null;
}
