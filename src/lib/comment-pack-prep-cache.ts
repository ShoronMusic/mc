/**
 * comment-pack の base → frees 間で、同一インスタンス上の前処理結果を短命再利用する。
 * Fluid の壁時計（YouTube / MusicBrainz / Music8）を frees でやり直さないための補助。
 */

export type CommentPackPrepSnapshot = {
  rawYouTubeTitle: string;
  title: string;
  authorName: string | null | undefined;
  artist: string | null;
  artistDisplay: string | null;
  song: string | null;
  songId: string | null;
  channelId: string | null;
  channelTitle: string | null;
  description: string | null;
  publishedAt: string | null;
  viewCount: number | null;
  defaultAudioLanguage: string | null;
  categoryId: number | null;
  isJpDomestic: boolean;
  isJpEconomy: boolean;
  artistLabel: string;
  songLabel: string;
  music8FactsBlockTrimmed: string;
  mbFactsBlockTrimmed: string;
  music8ModeratorHints: {
    artistJsonHit: boolean;
    songJsonHit: boolean;
  } | null;
  isSupergroupArtist: boolean;
  supergroupBlock: string;
  songIntroOnlyDiscography: boolean;
  isNewRelease: boolean;
  baseOnlyPack: boolean;
  musicaichatCover: boolean;
  knownCoverOriginalHint: string;
  /** Music8 song blob があれば intro-only 判定用に保持（巨大化回避のため optional） */
  hasMusic8SongBlob: boolean;
};

type CacheEntry = { expiresAt: number; snap: CommentPackPrepSnapshot };

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 80;
const cache = new Map<string, CacheEntry>();

function prune(now: number): void {
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
  while (cache.size > MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

export function setCommentPackPrepSnapshot(videoId: string, snap: CommentPackPrepSnapshot): void {
  const id = (videoId ?? '').trim();
  if (!id) return;
  const now = Date.now();
  prune(now);
  cache.set(id, { expiresAt: now + TTL_MS, snap });
}

export function getCommentPackPrepSnapshot(videoId: string): CommentPackPrepSnapshot | null {
  const id = (videoId ?? '').trim();
  if (!id) return null;
  const now = Date.now();
  const hit = cache.get(id);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    cache.delete(id);
    return null;
  }
  return hit.snap;
}

/** テスト用 */
export function clearCommentPackPrepSnapshotsForTests(): void {
  cache.clear();
}
