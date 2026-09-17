'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { GenreBestSongDetailActions } from '@/components/admin/GenreBestSongDetailActions';
import { useMusicLibraryStyleAdmin } from '@/components/music-library/MusicLibraryStyleAdminContext';
import { IS_MC_PRODUCT } from '@/lib/product-branding';
import type { MusicLibraryGenreLink } from '@/lib/music-library-types';

export function MusicLibrarySongGenreModal({
  open,
  songId,
  songTitle,
  artistName,
  genres,
  onClose,
}: {
  open: boolean;
  songId?: string | null;
  songTitle: string;
  artistName?: string | null;
  genres: MusicLibraryGenreLink[];
  onClose: () => void;
}) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const isStyleAdmin = useMusicLibraryStyleAdmin();
  const genreBestSongId = (songId ?? '').trim();
  const showGenreBest = isStyleAdmin && genreBestSongId.length > 0;
  const songLabel =
    [artistName?.trim(), songTitle.trim()].filter(Boolean).join(' - ') || songTitle.trim() || undefined;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const shell = IS_MC_PRODUCT
    ? 'relative w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-2xl'
    : 'relative w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl';
  const titleClass = IS_MC_PRODUCT
    ? 'pr-8 text-base font-semibold text-gray-900'
    : 'pr-8 text-base font-semibold text-white';
  const subClass = IS_MC_PRODUCT ? 'mt-1 truncate text-xs text-gray-500' : 'mt-1 truncate text-xs text-gray-400';
  const closeClass = IS_MC_PRODUCT
    ? 'absolute right-3 top-3 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700'
    : 'absolute right-3 top-3 rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white';
  const linkClass = IS_MC_PRODUCT
    ? 'block rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 hover:border-gray-400 hover:bg-white'
    : 'block rounded-lg border border-gray-700 bg-gray-950/60 px-3 py-2 text-sm text-gray-100 hover:border-gray-500 hover:bg-gray-800';
  const emptyClass = IS_MC_PRODUCT ? 'text-sm text-gray-500' : 'text-sm text-gray-400';
  const dividerClass = IS_MC_PRODUCT ? 'mt-4 border-t border-gray-200 pt-3' : 'mt-4 border-t border-gray-700 pt-3';

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={shell}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={closeClass} onClick={onClose} aria-label="閉じる">
          <XMarkIcon className="h-5 w-5" />
        </button>
        <h2 id={titleId} className={titleClass}>
          ジャンル
        </h2>
        {songTitle ? <p className={subClass}>{songTitle}</p> : null}
        {genres.length === 0 ? (
          <p className={`mt-4 ${emptyClass}`}>ジャンルがありません。</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {genres.map((g) => (
              <li key={g.slug}>
                <Link href={g.href} className={linkClass}>
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {showGenreBest ? (
          <div className={dividerClass}>
            <GenreBestSongDetailActions songId={genreBestSongId} songLabel={songLabel} className="space-y-2" />
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
