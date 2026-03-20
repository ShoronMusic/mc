'use client';

/**
 * Now Playing：現在の曲名・AI 解説表示（初期プレースホルダー）
 */

interface NowPlayingProps {
  title?: string;
  artist?: string;
  aiCommentary?: string;
}

export default function NowPlaying({
  title,
  artist,
  aiCommentary,
}: NowPlayingProps) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3 text-sm">
      <div className="font-medium text-white">
        {title ?? '—'} {artist != null && artist !== '' && `/ ${artist}`}
      </div>
      {aiCommentary && (
        <p className="mt-2 text-gray-400">{aiCommentary}</p>
      )}
    </div>
  );
}
