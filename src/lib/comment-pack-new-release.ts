import {
  resolveOriginalReleaseDateFromMusic8Json,
  resolveOriginalReleaseDateFromMusic8WpSongsFileJson,
} from '@/lib/music8-song-fields';

/** comment-pack の「新曲モード」閾値（YouTube 動画の publishedAt） */
export const COMMENT_PACK_NEW_RELEASE_DAYS = 30;

/** 原盤がこの日数より前ならカタログ曲とみなし、新曲モードにしない */
export const COMMENT_PACK_CATALOG_ESTABLISHED_DAYS = COMMENT_PACK_NEW_RELEASE_DAYS;

export function isYoutubeVideoPublishedWithinLastDays(
  publishedAtIso: string | undefined,
  days: number = COMMENT_PACK_NEW_RELEASE_DAYS,
): boolean {
  if (!publishedAtIso || typeof publishedAtIso !== 'string') return false;
  const d = new Date(publishedAtIso.trim());
  if (Number.isNaN(d.getTime())) return false;
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 0) return false;
  return diffMs <= days * 24 * 60 * 60 * 1000;
}

function isReleaseDateOlderThanDays(isoDate: string, days: number, now = Date.now()): boolean {
  const d = new Date(isoDate.trim());
  if (Number.isNaN(d.getTime())) return false;
  return now - d.getTime() > days * 24 * 60 * 60 * 1000;
}

function resolveEstablishedCatalogReleaseIsoFromMusic8(
  musicaichatSong: Record<string, unknown> | null | undefined,
  fallbackMusic8Song: Record<string, unknown> | null | undefined,
): string | null {
  for (const song of [musicaichatSong, fallbackMusic8Song]) {
    if (!song) continue;
    const fromMusicaichat = resolveOriginalReleaseDateFromMusic8Json(song);
    if (fromMusicaichat) return fromMusicaichat;
    const fromWpSongsFile = resolveOriginalReleaseDateFromMusic8WpSongsFileJson(song);
    if (fromWpSongsFile) return fromWpSongsFile;
  }
  return null;
}

/**
 * YouTube 概要欄から原盤の公開年らしき年を抽出（公式チャンネルの再投稿説明向け）。
 * 複数ヒット時は最も古い年を採用（「1972 show」「Released in 1972」等）。
 */
export function extractLegacyReleaseYearFromYoutubeDescription(description: string | null | undefined): number | null {
  const text = (description ?? '').trim();
  if (!text) return null;

  const years: number[] = [];
  const patterns = [
    /\breleased?\s+in\s+(\d{4})\b/gi,
    /\brelease(?:\s+date)?\s*:?\s*(\d{4})\b/gi,
    /\bfrom\s+(?:a\s+)?(\d{4})\s+show\b/gi,
    /\b(\d{4})\s+show\b/gi,
    /\bearly\s+(\d{4})s\b/gi,
    /\b(\d{4})s\s+(?:success|era|classic|hit)\b/gi,
    /\bon\s+the\s+album\b[^.\n]{0,80}\b(\d{4})\b/gi,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const y = Number(m[1]);
      if (Number.isFinite(y) && y >= 1900 && y <= 2100) years.push(y);
    }
  }

  if (years.length === 0) return null;
  return Math.min(...years);
}

function isLegacyReleaseYearEstablished(releaseYear: number, now = new Date()): boolean {
  const currentYear = now.getFullYear();
  if (releaseYear < currentYear - 1) return true;
  const jan1 = new Date(releaseYear, 0, 1).getTime();
  return now.getTime() - jan1 > COMMENT_PACK_CATALOG_ESTABLISHED_DAYS * 24 * 60 * 60 * 1000;
}

export type CommentPackNewReleaseDecisionInput = {
  youtubePublishedAt?: string | null;
  youtubeDescription?: string | null;
  musicaichatSong?: Record<string, unknown> | null;
  fallbackMusic8Song?: Record<string, unknown> | null;
  now?: Date;
};

/**
 * YouTube 動画が最近公開でも、原盤・概要欄からカタログ曲と分かる場合は新曲モードにしない。
 */
export function shouldApplyCommentPackNewReleaseMode(input: CommentPackNewReleaseDecisionInput): boolean {
  const now = input.now ?? new Date();
  const youtubeRecent = isYoutubeVideoPublishedWithinLastDays(
    input.youtubePublishedAt ?? undefined,
    COMMENT_PACK_NEW_RELEASE_DAYS,
  );
  if (!youtubeRecent) return false;

  const catalogIso = resolveEstablishedCatalogReleaseIsoFromMusic8(
    input.musicaichatSong,
    input.fallbackMusic8Song,
  );
  if (
    catalogIso &&
    isReleaseDateOlderThanDays(catalogIso, COMMENT_PACK_CATALOG_ESTABLISHED_DAYS, now.getTime())
  ) {
    return false;
  }

  const legacyYear = extractLegacyReleaseYearFromYoutubeDescription(input.youtubeDescription);
  if (legacyYear != null && isLegacyReleaseYearEstablished(legacyYear, now)) {
    return false;
  }

  return true;
}
