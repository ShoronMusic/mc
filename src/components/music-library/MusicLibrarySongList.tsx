'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LibraryYoutubePreviewPlayer } from '@/components/chat/LibraryYoutubePreviewPlayer';
import { MusicLibraryNowPlayingAside } from '@/components/music-library/MusicLibraryNowPlayingAside';
import { SongCoverThumb } from '@/components/song/SongCoverThumb';
import { IS_MC_PRODUCT } from '@/lib/product-branding';
import { formatMusicLibraryYearMonth } from '@/lib/music-library-labels';
import { music8NavStyleColor } from '@/lib/music8-catalog-slugs';
import type { MusicLibrarySongCard } from '@/lib/music-library-types';
import { musicLibraryPlayableTracks } from '@/lib/music-library-types';
import { withMusicLibraryAutoplay } from '@/lib/music-library-urls';

const MUSIC_LIBRARY_FIX_KEY = 'music-library-fix';

export type MusicLibrarySongListProps = {
  songs: MusicLibrarySongCard[];
  nextPageHref?: string | null;
  loop?: boolean;
  initialAutoplay?: boolean;
  initialIndex?: number;
  hideList?: boolean;
  listFooter?: ReactNode;
};

export function MusicLibrarySongList({
  songs,
  nextPageHref = null,
  loop = false,
  initialAutoplay = false,
  initialIndex = 0,
  hideList = false,
  listFooter = null,
}: MusicLibrarySongListProps) {
  const router = useRouter();
  const playable = useMemo(() => musicLibraryPlayableTracks(songs), [songs]);
  const playableIds = useMemo(() => playable.map((s) => s.id), [playable]);
  const [index, setIndex] = useState(() => {
    if (playable.length === 0) return 0;
    return Math.min(Math.max(0, initialIndex), playable.length - 1);
  });
  const [playNonce, setPlayNonce] = useState(initialAutoplay ? 1 : 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fixOn, setFixOn] = useState(false);
  const skipTimer = useRef<number | null>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLLIElement>(null);

  const current = playable[index] ?? null;
  const nowPlayingColor = music8NavStyleColor(current?.styleSlug) ?? '#ffffff';

  const goTo = useCallback(
    (next: number, play: boolean) => {
      if (playable.length === 0) return;
      if (next >= playable.length) {
        if (nextPageHref) {
          router.push(withMusicLibraryAutoplay(nextPageHref, 0));
          return;
        }
        if (loop) {
          setIndex(0);
          if (play) setPlayNonce((n) => n + 1);
          return;
        }
        return;
      }
      if (next < 0) {
        setIndex(0);
        return;
      }
      setIndex(next);
      if (play) setPlayNonce((n) => n + 1);
    },
    [loop, nextPageHref, playable.length, router],
  );

  const playAtQueueIndex = useCallback(
    (queueIndex: number) => {
      goTo(queueIndex, true);
    },
    [goTo],
  );

  const skip = useCallback(() => {
    goTo(index + 1, true);
  }, [goTo, index]);

  useEffect(() => {
    setIsPlaying(false);
  }, [current?.id]);

  useEffect(() => {
    try {
      setFixOn(window.localStorage.getItem(MUSIC_LIBRARY_FIX_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  const toggleFix = useCallback(() => {
    setFixOn((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MUSIC_LIBRARY_FIX_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (skipTimer.current != null) window.clearTimeout(skipTimer.current);
    };
  }, []);

  const scheduleSkip = useCallback(() => {
    if (skipTimer.current != null) window.clearTimeout(skipTimer.current);
    skipTimer.current = window.setTimeout(() => {
      skip();
    }, 400);
  }, [skip]);

  useEffect(() => {
    if (!fixOn || hideList || !current) return;
    let cancelled = false;
    let innerFrame = 0;
    const alignPlayingToSecondRow = () => {
      if (cancelled) return;
      const container = listScrollRef.current;
      const active = activeRowRef.current;
      if (!container || !active) return;
      const prev = active.previousElementSibling;
      const target = prev instanceof HTMLElement ? prev : active;
      const nextTop =
        container.scrollTop + (target.getBoundingClientRect().top - container.getBoundingClientRect().top);
      container.scrollTo({
        top: Math.max(0, nextTop),
        behavior: 'smooth',
      });
    };
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(alignPlayingToSecondRow);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(outerFrame);
      window.cancelAnimationFrame(innerFrame);
    };
  }, [current?.id, fixOn, hideList]);

  const titleClass = IS_MC_PRODUCT
    ? 'font-medium text-gray-900 hover:underline'
    : 'font-medium text-gray-100 hover:text-amber-200 hover:underline';
  const artistClass = IS_MC_PRODUCT
    ? 'text-sm text-gray-600 hover:underline'
    : 'text-sm text-gray-400 hover:text-sky-300 hover:underline';
  const rowActive = IS_MC_PRODUCT ? 'bg-gray-100' : 'bg-gray-900/80';
  const rowBorder = IS_MC_PRODUCT ? 'border-gray-200' : 'border-gray-800';
  const vocalBadge = (label: 'F' | 'M') => {
    const base = IS_MC_PRODUCT
      ? 'shrink-0 rounded border border-gray-300 px-1 py-px text-[10px] font-normal leading-none text-gray-600'
      : 'shrink-0 rounded border border-gray-600 px-1 py-px text-[10px] font-normal leading-none text-gray-300';
    if (label === 'F') {
      return IS_MC_PRODUCT ? `${base} bg-rose-100` : `${base} bg-rose-500/25`;
    }
    return IS_MC_PRODUCT ? `${base} bg-sky-100` : `${base} bg-sky-500/25`;
  };
  const originBadge = IS_MC_PRODUCT
    ? 'shrink-0 rounded border border-gray-300 px-1 py-px text-[10px] font-medium leading-none tracking-wide text-gray-600'
    : 'shrink-0 rounded border border-gray-600 px-1 py-px text-[10px] font-medium leading-none tracking-wide text-gray-300';
  const genreClass = IS_MC_PRODUCT
    ? 'min-w-0 max-w-[18rem] truncate text-[11px] text-gray-500'
    : 'min-w-0 max-w-[18rem] truncate text-[11px] text-gray-500';
  const dateClass = IS_MC_PRODUCT
    ? 'shrink-0 tabular-nums text-xs text-gray-500'
    : 'shrink-0 tabular-nums text-xs text-gray-500';

  const rootClass =
    !hideList && fixOn
      ? IS_MC_PRODUCT
        ? 'flex max-h-[calc(100svh-9rem)] flex-col gap-4 overflow-hidden md:sticky md:top-0 md:z-20 md:-mx-4 md:bg-[var(--mc-bg-page)] md:px-4 md:pt-1'
        : 'flex max-h-[calc(100svh-9rem)] flex-col gap-4 overflow-hidden md:sticky md:top-0 md:z-20 md:-mx-4 md:bg-gray-950 md:px-4 md:pt-1'
      : 'space-y-6';
  const topColumnClass = !hideList && fixOn ? 'shrink-0 space-y-3' : 'space-y-3';
  const listColumnClass = !hideList && fixOn ? 'min-h-0 flex-1 space-y-4 overflow-y-auto' : 'space-y-4';

  return (
    <div className={rootClass}>
      <div className={topColumnClass}>
        {hideList ? null : (
          <div className="flex justify-end">
            <button
              type="button"
              role="switch"
              aria-checked={fixOn}
              aria-label="プレイヤーと詳細を固定"
              onClick={toggleFix}
              className={
                IS_MC_PRODUCT
                  ? `inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${
                      fixOn
                        ? 'border-gray-800 bg-gray-900 text-white'
                        : 'border-gray-300 bg-white text-gray-600'
                    }`
                  : `inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${
                      fixOn
                        ? 'border-amber-400/70 bg-amber-400/20 text-amber-100'
                        : 'border-gray-600 bg-gray-900 text-gray-400'
                    }`
              }
            >
              <span
                className={`relative h-4 w-7 rounded-full ${
                  fixOn ? (IS_MC_PRODUCT ? 'bg-amber-400' : 'bg-amber-400') : IS_MC_PRODUCT ? 'bg-gray-300' : 'bg-gray-600'
                }`}
                aria-hidden
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                    fixOn ? 'left-3.5' : 'left-0.5'
                  }`}
                />
              </span>
              FIX
            </button>
          </div>
        )}
      {current?.videoId ? (
        <div className="grid gap-4 md:grid-cols-2 md:items-stretch">
          <div className={IS_MC_PRODUCT ? 'overflow-hidden rounded-xl border border-gray-200 bg-black' : 'overflow-hidden rounded-xl border border-gray-800 bg-black'}>
            <div className="aspect-video w-full">
              <LibraryYoutubePreviewPlayer
                videoId={current.videoId}
                playNonce={playNonce}
                iframeTitle={`${current.artistName} — ${current.songTitle}`}
                onPlaying={() => setIsPlaying(true)}
                onPausedOrEnded={() => setIsPlaying(false)}
                onEnded={scheduleSkip}
                onError={() => {
                  setIsPlaying(false);
                  scheduleSkip();
                }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm text-gray-200">
              <p className="min-w-0 truncate">
                {current.artistName} — {current.songTitle}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-white/10 hover:text-white"
                  onClick={() => goTo(index - 1, true)}
                >
                  前の曲
                </button>
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-white/10 hover:text-white"
                  onClick={() => goTo(index + 1, true)}
                >
                  次の曲
                </button>
              </div>
            </div>
          </div>
          <MusicLibraryNowPlayingAside song={current} />
        </div>
      ) : (
        <p className={IS_MC_PRODUCT ? 'text-sm text-gray-500' : 'text-sm text-gray-500'}>
          このページに再生できる YouTube がありません。
        </p>
      )}
      </div>

      {hideList ? null : (
      <div ref={listScrollRef} className={listColumnClass}>
      <ul className={`divide-y overflow-hidden rounded-xl border ${rowBorder}`}>
        {songs.map((song) => {
          const queueIndex = playableIds.indexOf(song.id);
          const active = current?.id === song.id;
          const title = song.href ? (
            <Link href={song.href} className={titleClass}>
              {song.songTitle}
            </Link>
          ) : (
            <span className={IS_MC_PRODUCT ? 'font-medium text-gray-900' : 'font-medium text-gray-100'}>
              {song.songTitle}
            </span>
          );
          const artists = song.artists?.length
            ? song.artists
            : [{ name: song.artistName, href: song.artistHref, slug: song.artistSlug, originLabel: null }];
          return (
            <li
              key={song.id}
              ref={active ? activeRowRef : undefined}
              aria-current={active ? 'true' : undefined}
              className={`flex items-center gap-3 px-3 py-2 ${
                active ? `music-library-now-playing ${isPlaying ? 'is-playing' : ''} ${rowActive}` : ''
              }`}
              style={
                active
                  ? ({ '--music-library-now-playing-color': nowPlayingColor } as CSSProperties)
                  : undefined
              }
            >
              <button
                type="button"
                className="shrink-0"
                onClick={() => {
                  if (queueIndex >= 0) playAtQueueIndex(queueIndex);
                }}
                disabled={queueIndex < 0}
                aria-label={`${song.songTitle} を再生`}
              >
                <SongCoverThumb
                  spotifyImages={song.spotifyImages}
                  videoId={song.videoId}
                  alt=""
                  className="h-12 w-12"
                />
              </button>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-baseline gap-1.5">
                  <span className="min-w-0 truncate">{title}</span>
                  {(song.vocalLabels ?? []).map((label) => (
                    <span key={label} className={vocalBadge(label)}>
                      {label}
                    </span>
                  ))}
                  {song.genreLabel ? <span className={genreClass}>{song.genreLabel}</span> : null}
                </p>
                <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                  {artists.map((artist, i) => {
                    const nameEl = artist.href ? (
                      <Link href={artist.href} className={artistClass}>
                        {artist.name}
                      </Link>
                    ) : (
                      <span className={IS_MC_PRODUCT ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>
                        {artist.name}
                      </span>
                    );
                    return (
                      <span key={`${artist.slug ?? artist.name}-${i}`} className="inline-flex min-w-0 max-w-full items-center gap-1">
                        <span className="min-w-0 truncate">{nameEl}</span>
                        {artist.originLabel ? <span className={originBadge}>{artist.originLabel}</span> : null}
                      </span>
                    );
                  })}
                </p>
              </div>
              <span className={dateClass}>{formatMusicLibraryYearMonth(song.releaseDate) ?? ''}</span>
            </li>
          );
        })}
      </ul>
      {listFooter}
      </div>
      )}
    </div>
  );
}
