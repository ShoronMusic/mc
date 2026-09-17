'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { GenreBestRegisterModal } from '@/components/admin/GenreBestRegisterModal';
import type { GenreBestSongLabel } from '@/lib/catalog-genre-best';

type Props = {
  songId: string;
  songLabel?: string;
  className?: string;
};

/**
 * 曲詳細プレイヤー下: Genre BEST 登録ボタン＋登録済みラベル（リンク）
 */
export function GenreBestSongDetailActions({ songId, songLabel, className = 'mt-3 space-y-2' }: Props) {
  const [labels, setLabels] = useState<GenreBestSongLabel[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadLabels = useCallback(async () => {
    const id = songId.trim();
    if (!id) {
      setLabels([]);
      return;
    }
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/admin/genre-best/for-songs?ids=${encodeURIComponent(id)}`,
        { credentials: 'include' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 503) {
          setLabels([]);
          setLoadError(typeof data.error === 'string' ? data.error : null);
          return;
        }
        setLoadError(typeof data.error === 'string' ? data.error : 'ラベル取得に失敗');
        return;
      }
      const bySongId =
        data.bySongId && typeof data.bySongId === 'object'
          ? (data.bySongId as Record<string, GenreBestSongLabel[]>)
          : {};
      setLabels(Array.isArray(bySongId[id]) ? bySongId[id] : []);
    } catch {
      setLoadError('ラベル取得に失敗');
    }
  }, [songId]);

  useEffect(() => {
    void loadLabels();
  }, [loadLabels]);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
        >
          Genre BEST
        </button>
        {labels.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1 text-xs text-gray-400">
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
        ) : (
          <span className="text-xs text-gray-600">未登録</span>
        )}
      </div>
      {loadError ? <p className="text-[11px] text-amber-700/90">{loadError}</p> : null}

      <GenreBestRegisterModal
        open={modalOpen}
        songId={songId}
        songLabel={songLabel}
        onClose={() => setModalOpen(false)}
        onRegistered={(pl) => {
          setLabels((prev) => {
            if (prev.some((x) => x.slug === pl.slug)) return prev;
            return [...prev, pl].sort((a, b) =>
              a.title.localeCompare(b.title, 'en', { sensitivity: 'base', numeric: true }),
            );
          });
        }}
      />
    </div>
  );
}
