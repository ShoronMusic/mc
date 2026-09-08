import { youtubeVideoIdFromUnknown } from '@/lib/music8-catalog-slugs';

export type SongCoverImageSource = 'spotify' | 'youtube' | null;

export type SongCoverImage = {
  url: string | null;
  source: SongCoverImageSource;
};

/** YouTube 公式サムネ（hqdefault。video_id から都度生成し、DB には保存しない） */
export function youtubeThumbnailUrlFromVideoId(videoId: string | null | undefined): string | null {
  const id = youtubeVideoIdFromUnknown(videoId ?? '');
  if (!id) return null;
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/**
 * 曲一覧・詳細のカバー。Spotify ジャケット URL を優先し、無ければ YouTube サムネ。
 */
export function resolveSongCoverImage(params: {
  spotifyImages?: string | null;
  videoId?: string | null;
}): SongCoverImage {
  const spotify = (params.spotifyImages ?? '').trim();
  if (spotify && /^https?:\/\//i.test(spotify)) {
    return { url: spotify, source: 'spotify' };
  }
  const youtube = youtubeThumbnailUrlFromVideoId(params.videoId);
  if (youtube) return { url: youtube, source: 'youtube' };
  return { url: null, source: null };
}
