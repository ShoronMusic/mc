'use client';

import { useEffect, useState } from 'react';
import { formatLibraryVocalDisplay } from '@/lib/library-vocal-display';
import { fetchMusic8SongLibraryMeta } from '@/components/chat/LibraryMusic8SongComment';

type LibrarySongVocalRowsProps = {
  fallbackVocal: string | null | undefined;
  videoId: string | null;
  artistName: string | null;
  songTitle: string | null;
  rowKeyPrefix?: string;
};

/** 曲詳細のボーカル行。F / M / F,M のみ。無ければ非表示。 */
export function LibrarySongVocalRows({
  fallbackVocal,
  videoId,
  artistName,
  songTitle,
  rowKeyPrefix = '',
}: LibrarySongVocalRowsProps) {
  const fromRow = formatLibraryVocalDisplay(fallbackVocal);
  const [fromMusic8, setFromMusic8] = useState<string | null>(null);

  useEffect(() => {
    if (fromRow) {
      setFromMusic8(null);
      return;
    }
    const vid = (videoId ?? '').trim();
    const artist = (artistName ?? '').trim();
    const title = (songTitle ?? '').trim();
    if (!vid && (!artist || !title)) {
      setFromMusic8(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const meta = await fetchMusic8SongLibraryMeta(vid || null, artist, title);
        if (!cancelled) setFromMusic8(formatLibraryVocalDisplay(meta.vocalLabel));
      } catch {
        if (!cancelled) setFromMusic8(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromRow, videoId, artistName, songTitle]);

  const value = fromRow || fromMusic8;
  if (!value) return null;

  return (
    <>
      <dt key={`${rowKeyPrefix}vocal-dt`} className="whitespace-nowrap text-gray-500">
        ボーカル：
      </dt>
      <dd key={`${rowKeyPrefix}vocal-dd`} className="min-w-0 break-words">
        {value}
      </dd>
    </>
  );
}
