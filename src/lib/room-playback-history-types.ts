/**
 * 部屋視聴履歴行の共有型（クライアントから API route を import しないための正本）。
 */

export type RoomPlaybackHistoryRow = {
  id: string;
  room_id: string;
  video_id: string;
  display_name: string;
  is_guest: boolean;
  played_at: string;
  title: string | null;
  artist_name: string | null;
  style: string | null;
  /** 同期部屋の選曲ラウンド（列未追加のDBでは null） */
  selection_round: number | null;
  /** `song_era` テーブル由来（GET 時に video_id で結合） */
  era: string | null;
};
