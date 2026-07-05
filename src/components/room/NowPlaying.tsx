'use client';

/**
 * プレイヤー直下: 再生中曲のアーティスト - 曲名（♪ 付き）
 */

interface NowPlayingProps {
  artistTitle?: string | null;
}

export default function NowPlaying({ artistTitle }: NowPlayingProps) {
  const line = typeof artistTitle === 'string' ? artistTitle.trim() : '';
  return (
    <div
      className="flex min-h-[2rem] shrink-0 items-center gap-1.5 rounded-lg bg-gray-950 px-2.5 py-1.5 text-xs text-gray-200"
      aria-live="polite"
    >
      <span className="shrink-0 font-semibold text-orange-200" aria-hidden>
        ♪
      </span>
      <span className="min-w-0 truncate font-medium" title={line || undefined}>
        {line || '—'}
      </span>
    </div>
  );
}
