'use client';

import { useEffect, useMemo, useState } from 'react';
import { resolveSongCoverImage, youtubeThumbnailUrlFromVideoId } from '@/lib/song-cover-image';

type Props = {
  spotifyImages?: string | null;
  videoId?: string | null;
  alt?: string;
  className?: string;
};

/**
 * 曲一覧用カバー。Spotify ジャケットが無ければ YouTube サムネ。
 * Spotify URL が 404 のときは YouTube へ切り替える。
 */
export function SongCoverThumb({
  spotifyImages,
  videoId,
  alt = '',
  className = 'h-10 w-10',
}: Props) {
  const cover = useMemo(
    () => resolveSongCoverImage({ spotifyImages, videoId }),
    [spotifyImages, videoId],
  );
  const youtubeUrl = useMemo(() => youtubeThumbnailUrlFromVideoId(videoId), [videoId]);
  const [src, setSrc] = useState<string | null>(cover.url);

  useEffect(() => {
    setSrc(cover.url);
  }, [cover.url]);

  const boxClass = `block shrink-0 overflow-hidden rounded bg-gray-800 object-cover ${className}`;

  if (!src) {
    return <span className={`${boxClass} block`} aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={boxClass}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (src !== youtubeUrl && youtubeUrl) {
          setSrc(youtubeUrl);
          return;
        }
        setSrc(null);
      }}
    />
  );
}
