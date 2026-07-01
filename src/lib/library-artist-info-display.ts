/** ライブラリ「アーティスト詳細」: DB 行が実質プロフィール未整備か（Music8 フォールバック判定） */
export function isLibraryArtistInfoSparse(info: {
  image_url?: string | null;
  profile_text?: string | null;
  name_ja?: string | null;
  origin_country?: string | null;
  kind?: string | null;
  active_period?: string | null;
  members?: string | null;
} | null): boolean {
  if (!info) return true;
  if ((info.image_url ?? '').trim()) return false;
  if ((info.profile_text ?? '').trim()) return false;
  const hasRichMeta =
    Boolean((info.origin_country ?? '').trim()) ||
    Boolean((info.kind ?? '').trim()) ||
    Boolean((info.active_period ?? '').trim()) ||
    Boolean((info.members ?? '').trim());
  return !hasRichMeta;
}
