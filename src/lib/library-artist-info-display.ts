/** ライブラリ「アーティスト詳細」: DB 行が実質名前だけかどうか */
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
  const hasMeta =
    Boolean((info.name_ja ?? '').trim()) ||
    Boolean((info.origin_country ?? '').trim()) ||
    Boolean((info.kind ?? '').trim()) ||
    Boolean((info.active_period ?? '').trim()) ||
    Boolean((info.members ?? '').trim());
  return !hasMeta;
}
