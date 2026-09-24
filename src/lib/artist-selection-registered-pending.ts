/**
 * 選曲／曲登録由来アーティストが「まだ整備が必要」か（クライアント安全・node 非依存）
 */
import { resolveDomesticArtistRegistrationStatus } from '@/lib/admin-domestic-artist-registration-status';

/** 管理画面：選曲由来で「まだ整備が必要」なアーティストか */
export function isSelectionRegisteredArtistPendingWp(row: {
  music8_artist_id?: number | null;
  music8_synced_at?: string | null;
  spotify_artist_id?: string | null;
  profile_text?: string | null;
  description_en?: string | null;
  ai_profile_generated_at?: string | null;
  name_ja?: string | null;
  name_en?: string | null;
  origin_country?: string | null;
  youtube_channel_id?: string | null;
  wikipedia_page?: string | null;
  wikipedia_url?: string | null;
  kind?: string | null;
  occupations?: string[] | null;
}): boolean {
  const m8Id = row.music8_artist_id;
  if (typeof m8Id === 'number' && m8Id > 0) return false;
  if (row.music8_synced_at?.trim()) return false;
  // Spotify / プロフィールが入っていれば邦楽登録等で整備済みとみなす
  if (row.spotify_artist_id?.trim()) return false;
  if ((row.profile_text ?? '').trim().length >= 40) return false;
  if ((row.description_en ?? '').trim().length >= 40) return false;
  if (row.ai_profile_generated_at?.trim()) return false;
  const domestic = resolveDomesticArtistRegistrationStatus(row);
  if (domestic.hasBasicInfo) return false;
  return true;
}
