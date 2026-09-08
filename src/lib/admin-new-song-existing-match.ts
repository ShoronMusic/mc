/**
 * 洋楽 1 曲登録: 入力の artist/title から既存 songs 候補を絞り込む（確認付き別 PV 追記用）。
 */
import {
  matchAlternatePvToExistingSong,
  compactArtistSetKey,
  type AlternatePvMatchLevel,
  type AlternatePvMatchResult,
  MAX_SONG_VIDEO_VARIANTS,
} from '@/lib/song-alternate-pv-match';
import { compactMatchKey } from '@/lib/song-registration-normalize';

export type ExistingSongRowForMatch = {
  id: string;
  display_title: string | null;
  main_artist: string | null;
  song_title: string | null;
};

export type ExistingSongMatchCandidate = {
  songId: string;
  displayTitle: string | null;
  mainArtist: string | null;
  songTitle: string | null;
  match: Pick<AlternatePvMatchResult, 'level' | 'reasons'>;
  videoCount: number;
  videoIds: string[];
  alreadyHasVideo: boolean;
  atCap: boolean;
};

const LEVEL_RANK: Record<AlternatePvMatchLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
  reject: 3,
};

/** PostgREST ilike 用に % _ をエスケープ */
export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** 曲名検索用の短いトークン（括弧内バージョン表記は落とす） */
export function songTitleSearchToken(title: string): string {
  return title
    .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildExistingSongIlikePatterns(artist: string, title: string): {
  titleLike: string;
  artistPrimaryLike: string | null;
  displayLike: string | null;
} {
  const titleTok = songTitleSearchToken(title);
  const artistTok = artist.trim();
  const primary = artistTok.split(',')[0]?.trim() || artistTok;
  return {
    titleLike: titleTok ? `%${escapeIlikePattern(titleTok)}%` : '',
    artistPrimaryLike: primary ? `%${escapeIlikePattern(primary)}%` : null,
    displayLike:
      primary && titleTok
        ? `%${escapeIlikePattern(primary)}%${escapeIlikePattern(titleTok)}%`
        : null,
  };
}

export function shouldSurfaceExistingSongMatch(level: AlternatePvMatchLevel): boolean {
  return level === 'high' || level === 'medium';
}

export function rankExistingSongsForNewRegister(opts: {
  incomingArtist: string;
  incomingTitle: string;
  incomingYoutubeTitle?: string | null;
  incomingDescription?: string | null;
  incomingChannelId?: string | null;
  youtubeId?: string | null;
  rows: ExistingSongRowForMatch[];
  videosBySongId: Map<string, { videoId: string; channelId?: string | null }[]>;
}): ExistingSongMatchCandidate[] {
  const youtubeId = (opts.youtubeId ?? '').trim();
  const out: ExistingSongMatchCandidate[] = [];

  for (const row of opts.rows) {
    const songId = row.id;
    if (!songId) continue;
    const vids = opts.videosBySongId.get(songId) ?? [];
    const channelIds = vids.map((v) => (v.channelId ?? '').trim()).filter(Boolean);
    const match = matchAlternatePvToExistingSong({
      existingArtist: row.main_artist ?? '',
      existingTitle: row.song_title ?? '',
      incomingArtist: opts.incomingArtist,
      incomingTitle: opts.incomingTitle,
      incomingYoutubeTitle: opts.incomingYoutubeTitle,
      incomingDescription: opts.incomingDescription,
      incomingChannelId: opts.incomingChannelId,
      existingChannelIds: channelIds,
    });
    if (!shouldSurfaceExistingSongMatch(match.level)) continue;

    const videoIds = vids.map((v) => v.videoId);
    const alreadyHasVideo = Boolean(youtubeId && videoIds.includes(youtubeId));
    const videoCount = videoIds.length;
    out.push({
      songId,
      displayTitle: row.display_title,
      mainArtist: row.main_artist,
      songTitle: row.song_title,
      match: { level: match.level, reasons: match.reasons },
      videoCount,
      videoIds,
      alreadyHasVideo,
      atCap: !alreadyHasVideo && videoCount >= MAX_SONG_VIDEO_VARIANTS,
    });
  }

  out.sort((a, b) => {
    const byLevel = LEVEL_RANK[a.match.level] - LEVEL_RANK[b.match.level];
    if (byLevel !== 0) return byLevel;
    if (a.alreadyHasVideo !== b.alreadyHasVideo) return a.alreadyHasVideo ? -1 : 1;
    return (a.displayTitle ?? '').localeCompare(b.displayTitle ?? '', 'ja');
  });

  return out;
}

/** 単体テスト用: compact キーが同じなら高確度候補になりうる */
export function sameCompactArtistTitle(
  aArtist: string,
  aTitle: string,
  bArtist: string,
  bTitle: string,
): boolean {
  return (
    compactArtistSetKey(aArtist) === compactArtistSetKey(bArtist) &&
    compactMatchKey(aTitle) === compactMatchKey(bTitle) &&
    Boolean(compactMatchKey(aTitle))
  );
}
