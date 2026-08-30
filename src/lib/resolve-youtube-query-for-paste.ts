import type { UserSongPickExclude } from '@/lib/character-song-pick-exclude';
import { formatArtistTitle } from '@/lib/format-song-display';
import { searchYouTubeWithFallback } from '@/lib/youtube-search';

export type ResolveYoutubeQueryForPasteInput = {
  query: string;
  roomId?: string;
  /** searchYouTubeWithFallback のログ用 source */
  apiSource: string;
  excludeVideoIds?: string[];
  excludeUserSongPicks?: UserSongPickExclude[];
  excludeAiSongPicks?: UserSongPickExclude[];
  excludeArtists?: string[];
  /** エージェント選曲: 公式 PV 優先・邦楽／編集動画は採用しない */
  preferOfficialPv?: boolean;
};

export type ResolveYoutubeQueryForPasteOk = {
  ok: true;
  videoId: string;
  title: string;
  channelTitle: string;
  artistTitle: string;
  watchUrl: string;
};

export type ResolveYoutubeQueryForPasteResult =
  | ResolveYoutubeQueryForPasteOk
  | { ok: false; reason: 'no_hit' };

/**
 * paste-by-query と同じ検索・フォールバックで 1 本の動画に解決する（サーバー専用）。
 */
export async function resolveYoutubeQueryForPaste(
  input: ResolveYoutubeQueryForPasteInput,
): Promise<ResolveYoutubeQueryForPasteResult> {
  const q = input.query.trim();
  if (!q) return { ok: false, reason: 'no_hit' };
  const preferOfficialPv = input.preferOfficialPv === true;
  const qHasOfficial = /\bofficial\b/i.test(q);
  const fallbackQueries = preferOfficialPv
    ? qHasOfficial
      ? [q, `${q} music`]
      : [`${q} official video`, `${q} official`, q]
    : [q, `${q} official`, `${q} music`];
  const searchOptions = {
    excludeVideoIds: input.excludeVideoIds,
    excludeUserSongPicks: input.excludeUserSongPicks,
    excludeAiSongPicks: input.excludeAiSongPicks,
    excludeArtists: input.excludeArtists,
    ...(preferOfficialPv ? { preferOfficialPv: true } : {}),
  };
  const hasExclude =
    (input.excludeVideoIds?.length ?? 0) > 0 ||
    (input.excludeUserSongPicks?.length ?? 0) > 0 ||
    (input.excludeAiSongPicks?.length ?? 0) > 0 ||
    (input.excludeArtists?.length ?? 0) > 0;
  const hit = await searchYouTubeWithFallback(
    fallbackQueries,
    {
      roomId: input.roomId,
      source: input.apiSource,
    },
    preferOfficialPv || hasExclude ? searchOptions : undefined,
  );
  if (!hit) return { ok: false, reason: 'no_hit' };
  const artistTitle = formatArtistTitle(hit.title, hit.channelTitle);
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(hit.videoId)}`;
  return {
    ok: true,
    videoId: hit.videoId,
    title: hit.title,
    channelTitle: hit.channelTitle,
    artistTitle,
    watchUrl,
  };
}
