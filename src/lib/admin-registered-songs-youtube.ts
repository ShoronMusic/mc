import { rankLibraryVideoVariant } from '@/lib/library-video-variant-rank';

export type RegisteredSongVideoCandidate = {
  videoId: string;
  variant?: string | null;
};

/**
 * 登録曲一覧の YouTube リンク用。canonical（music8_video_id）を優先し、
 * 無ければ song_videos から公式寄りの代表 ID を拾う。
 */
export function resolveRegisteredSongYoutubeId(opts: {
  music8VideoId?: string | null;
  videos?: RegisteredSongVideoCandidate[];
}): string | null {
  const canonical = (opts.music8VideoId ?? '').trim();
  if (canonical) return canonical;
  const videos = (opts.videos ?? []).filter((v) => (v.videoId ?? '').trim());
  if (videos.length === 0) return null;
  let best = videos[0];
  let bestRank = rankLibraryVideoVariant(best.variant);
  for (const v of videos.slice(1)) {
    const rank = rankLibraryVideoVariant(v.variant);
    if (rank < bestRank) {
      best = v;
      bestRank = rank;
    }
  }
  return best.videoId.trim() || null;
}
