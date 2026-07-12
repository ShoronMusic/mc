'use client';

/**
 * プレイヤー直下: 再生中曲のアーティスト - 曲名（♪ 付き）
 */

import { IS_MC_PRODUCT } from '@/lib/product-branding';

interface NowPlayingProps {
  artistTitle?: string | null;
}

export default function NowPlaying({ artistTitle }: NowPlayingProps) {
  const line = typeof artistTitle === 'string' ? artistTitle.trim() : '';
  return (
    <div
      className={
        IS_MC_PRODUCT
          ? 'mc-room-player-now-playing flex min-h-[2rem] shrink-0 items-center gap-1.5 border-t px-2.5 py-1.5 text-xs text-gray-800'
          : 'flex min-h-[2rem] shrink-0 items-center gap-1.5 border-t border-gray-700 bg-gray-950/90 px-2.5 py-1.5 text-xs text-gray-200'
      }
      aria-live="polite"
    >
      <span
        className={`shrink-0 font-semibold ${IS_MC_PRODUCT ? 'text-green-700' : 'text-orange-200'}`}
        aria-hidden
      >
        ♪
      </span>
      <span className="min-w-0 truncate font-medium" title={line || undefined}>
        {line || '—'}
      </span>
    </div>
  );
}
