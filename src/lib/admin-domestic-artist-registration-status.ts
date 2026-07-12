/**
 * 邦楽アーティスト登録の段階ステータス（管理画面一覧用）
 */

export type DomesticArtistRegistrationStatus = {
  /** 1=名前のみ … 5=全項目 */
  stage: 1 | 2 | 3 | 4 | 5;
  hasBasicInfo: boolean;
  hasSpotify: boolean;
  hasYoutube: boolean;
  hasWikipedia: boolean;
};

export type DomesticArtistRegistrationStatusInput = {
  description_en?: string | null;
  profile_text?: string | null;
  ai_profile_generated_at?: string | null;
  ai_profile_source?: string | null;
  name_ja?: string | null;
  origin_country?: string | null;
  active_period?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  occupations?: string[] | null;
  kind?: string | null;
  spotify_artist_id?: string | null;
  youtube_channel_id?: string | null;
  wikipedia_page?: string | null;
};

function nonEmpty(s: string | null | undefined): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}

function hasOccupations(row: DomesticArtistRegistrationStatusInput): boolean {
  if (Array.isArray(row.occupations) && row.occupations.some((x) => nonEmpty(x))) return true;
  return nonEmpty(row.kind);
}

export function resolveDomesticArtistRegistrationStatus(
  row: DomesticArtistRegistrationStatusInput,
): DomesticArtistRegistrationStatus {
  const hasBasicInfo =
    nonEmpty(row.ai_profile_generated_at) ||
    nonEmpty(row.ai_profile_source) ||
    (nonEmpty(row.description_en) || nonEmpty(row.profile_text)) &&
      (nonEmpty(row.name_ja) ||
        nonEmpty(row.origin_country) ||
        nonEmpty(row.active_period) ||
        nonEmpty(row.birth_date) ||
        nonEmpty(row.death_date) ||
        hasOccupations(row));

  const hasSpotify = nonEmpty(row.spotify_artist_id);
  const hasYoutube = nonEmpty(row.youtube_channel_id);
  const hasWikipedia = nonEmpty(row.wikipedia_page);

  let stage: 1 | 2 | 3 | 4 | 5 = 1;
  if (hasBasicInfo) stage = 2;
  if (hasBasicInfo && hasSpotify) stage = 3;
  if (hasBasicInfo && hasSpotify && hasYoutube) stage = 4;
  if (hasBasicInfo && hasSpotify && hasYoutube && hasWikipedia) stage = 5;

  return { stage, hasBasicInfo, hasSpotify, hasYoutube, hasWikipedia };
}
