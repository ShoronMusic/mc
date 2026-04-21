/**
 * チャットメッセージ・部屋まわりの型
 */

import type { SongQuizPayload } from '@/lib/song-quiz-types';

export type MessageType = 'user' | 'ai' | 'system';

/** システム警告「@ 質問の音楽関連チェック」用メタ（異議申立て・表示制御用） */
export interface AiQuestionGuardMeta {
  targetClientId: string;
  warningCount: number;
  yellowCards: number;
  action: 'warn' | 'yellow' | 'ban';
}

/** addSystemMessage の第2引数（文字列は searchQuery、オブジェクトは拡張メタ） */
export type SystemMessageOptions =
  | string
  | {
      searchQuery?: string;
      systemKind?: 'ai_question_guard';
      aiGuardMeta?: AiQuestionGuardMeta;
    };

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
  aiSource?: 'commentary' | 'tidbit' | 'chat_reply' | 'next_song_recommend' | 'other';
  /** next_song_recommendations.id（おすすめ曲単位の評価・管理者削除用） */
  recommendationId?: string | null;
  /** AI 本文の強調（入室直後の選曲案内など。未設定は通常色） */
  aiBodyEmphasis?: 'yellow';
  /** song_tidbits の行ID（comment-pack 由来のみ。モデレーターNG用） */
  tidbitId?: string | null;
  /** モデレーターがNGを押しライブラリから無効化済み（ローカル表示用） */
  tidbitLibraryRejected?: boolean;
  /** 邦楽アナウンス同期用（表示には使わない） */
  jpDomesticSilenceForVideoId?: string;
  /** 参加者入室通知メッセージ専用。true のときだけ入室効果音を鳴らす（本文の部分一致に依存しない） */
  playJoinChime?: boolean;
  /** 参加者退室通知メッセージ専用。true のときだけ退室効果音を鳴らす */
  playLeaveChime?: boolean;
  /** システムメッセージの種別（異議ボタン表示など） */
  systemKind?: 'ai_question_guard' | 'song_quiz';
  /** AI 質問ガード警告の詳細（systemKind が ai_question_guard のとき） */
  aiGuardMeta?: AiQuestionGuardMeta;
  /** systemKind が song_quiz のときの三択データ */
  songQuiz?: SongQuizPayload;
}

/** Ably で送るチャットイベントのペイロード */
export const CHAT_MESSAGE_EVENT = 'chat:message';

/** 三択クイズの回答（最古入室者が集計） */
export const SONG_QUIZ_ANSWER_EVENT = 'song-quiz:answer';

export interface SongQuizAnswerPayload {
  quizMessageId: string;
  videoId: string;
  clientId: string;
  displayName: string;
  pickedIndex: number;
}

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
  aiSource?: 'commentary' | 'tidbit' | 'chat_reply' | 'next_song_recommend' | 'other';
  recommendationId?: string | null;
  /** AI 本文の強調（入室直後の選曲案内など） */
  aiBodyEmphasis?: 'yellow';
  /** song_tidbits の行ID（comment-pack 由来） */
  tidbitId?: string | null;
  /** 邦楽選曲アナウンス時のみ。受信クライアントが同じ videoId の間 AI 発言を止める */
  jpDomesticSilenceForVideoId?: string;
  /** 参加者入室通知。受信側で入室音用 */
  playJoinChime?: boolean;
  /** 参加者退室通知。受信側で退室音用 */
  playLeaveChime?: boolean;
  systemKind?: 'ai_question_guard' | 'song_quiz';
  songQuiz?: SongQuizPayload;
}
