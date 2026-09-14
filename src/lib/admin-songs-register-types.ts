import type { ExistingSongMatchCandidate } from '@/lib/admin-new-song-existing-match';

/** GET/POST `/api/admin/songs-register` の応答（クライアントからも参照可） */
export type AdminSongsRegisterResponse = {
  error?: string;
  songId?: string;
  videoId?: string;
  exportPath?: string | null;
  exportSkipped?: boolean;
  youtubePublishedAt?: string | null;
  youtubeTitle?: string | null;
  youtubeChannelTitle?: string | null;
  suggestedVariant?: string | null;
  /** 同一曲の可能性が高い既存曲（別 PV 追記候補） */
  existingMatches?: ExistingSongMatchCandidate[];
  /** この video_id が既に紐づいている曲 */
  videoAlreadyOnSongId?: string | null;
  maxSongVideoVariants?: number;
};
