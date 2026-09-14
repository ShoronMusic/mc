'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { GenreBestSongLabel } from '@/lib/catalog-genre-best';

export function GenreBestRegisteredLabelLinks({
  labels,
  className = 'text-[11px] text-gray-400',
}: {
  labels: GenreBestSongLabel[] | undefined;
  className?: string;
}) {
  if (!labels?.length) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      [
      {labels.map((lb, i) => (
        <span key={lb.slug}>
          {i > 0 ? <span className="text-gray-600">, </span> : null}
          <Link
            href={`/admin/genre-best/${encodeURIComponent(lb.slug)}`}
            className="text-sky-400 hover:underline"
          >
            {lb.title}
          </Link>
        </span>
      ))}
      ]
    </span>
  );
}

/** 曲 ID 群の Genre BEST 登録ラベルをまとめて取得する */
export function useGenreBestLabelsBySongIds(songIds: readonly string[]) {
  const songIdsKey = songIds.filter(Boolean).join(',');
  const [labelsBySong, setLabelsBySong] = useState<Record<string, GenreBestSongLabel[]>>({});

  useEffect(() => {
    const ids = songIdsKey.split(',').filter(Boolean);
    if (ids.length === 0) {
      setLabelsBySong({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/genre-best/for-songs?ids=${encodeURIComponent(ids.join(','))}`,
          { credentials: 'include' },
        );
        const data = (await res.json().catch(() => ({}))) as {
          bySongId?: Record<string, GenreBestSongLabel[]>;
        };
        if (cancelled) return;
        if (!res.ok || !data.bySongId || typeof data.bySongId !== 'object') {
          setLabelsBySong({});
          return;
        }
        setLabelsBySong(data.bySongId);
      } catch {
        if (!cancelled) setLabelsBySong({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [songIdsKey]);

  return labelsBySong;
}
