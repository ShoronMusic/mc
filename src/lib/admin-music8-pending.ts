/**
 * 管理画面「Music8 未連携の選曲」一覧用ヘルパー。
 * 視聴履歴で流れた `video_id` が、曲マスタ上で Music8 スナップショットを持たないかを判定する。
 */

export type VideoMusic8LinkInfo = {
  songId: string | null;
  hasMusic8: boolean;
};

/** `songs.music8_song_data` に `buildPersistableMusic8SongSnapshot` 由来の kind が載っているか */
export function songRowHasPersistedMusic8(music8_song_data: unknown): boolean {
  if (music8_song_data == null) return false;
  if (typeof music8_song_data !== 'object' || Array.isArray(music8_song_data)) return false;
  const kind = (music8_song_data as Record<string, unknown>).kind;
  return kind === 'musicaichat_v1' || kind === 'music8_wp_song';
}

/** `played_at`（ISO UTC）を JST の暦日 `YYYY-MM-DD` に変換 */
export function jstDateKeyFromPlayedAt(playedAtIso: string): string {
  const d = new Date(playedAtIso);
  if (Number.isNaN(d.getTime())) return '1970-01-01';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
