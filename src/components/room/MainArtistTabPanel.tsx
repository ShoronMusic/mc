'use client';

/**
 * メインアーティストタブの内容。music8 の JSON を取得して表示（テスト実装）。
 */

import { useEffect, useState } from 'react';
import {
  formatArtistDisplayName,
  formatMusic8ArtistDisplayLines,
  type Music8ArtistJson,
} from '@/lib/music8-artist-display';
import { findLibraryMainArtistInIndex } from '@/lib/library-artist-index-match';
import { ReferencedMusicDataDisclaimer } from '@/components/room/ReferencedMusicDataDisclaimer';

interface MainArtistTabPanelProps {
  artistName: string;
  songTitle: string | null;
  /** 索引にいるとき「ライブラリ」から部屋の選曲ライブラリを開く */
  onOpenLibraryForArtist?: (
    mainArtist: string,
    options?: { music8Artist?: Music8ArtistJson | null },
  ) => void;
}

export default function MainArtistTabPanel({
  artistName,
  songTitle,
  onOpenLibraryForArtist,
}: MainArtistTabPanelProps) {
  const [data, setData] = useState<Music8ArtistJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [libraryMainArtist, setLibraryMainArtist] = useState<string | null>(null);

  useEffect(() => {
    if (!artistName?.trim()) {
      setData(null);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    fetch(`/api/music8/artist-by-name?artistName=${encodeURIComponent(artistName)}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Not found'))))
      .then((json) => {
        const artist = (json as { artist?: unknown })?.artist;
        if (artist && typeof artist === 'object') {
          setData(artist as Music8ArtistJson);
          setError(false);
          return;
        }
        setData(null);
        setError(true);
      })
      .catch(() => {
        setData(null);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [artistName]);

  useEffect(() => {
    if (!data || !onOpenLibraryForArtist) {
      setLibraryMainArtist(null);
      return;
    }
    const lines = formatMusic8ArtistDisplayLines(data);
    const englishDisplay = formatArtistDisplayName(
      data.name,
      typeof data.thePrefix === 'string' ? data.thePrefix : undefined,
    );
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/library/artists');
        const json = (await res.json().catch(() => null)) as {
          items?: { main_artist: string }[];
        } | null;
        if (!res.ok || cancelled) {
          if (!cancelled) setLibraryMainArtist(null);
          return;
        }
        const items = Array.isArray(json?.items) ? json!.items! : [];
        const found = findLibraryMainArtistInIndex(
          [artistName, englishDisplay, lines.nameDisplay],
          items,
        );
        if (!cancelled) setLibraryMainArtist(found);
      } catch {
        if (!cancelled) setLibraryMainArtist(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artistName, data, onOpenLibraryForArtist]);

  if (!artistName?.trim()) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center p-4 text-sm text-gray-500">
        再生中の曲のメインアーティストが取得できていません
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center p-4 text-sm text-gray-500">
        読み込み中...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col gap-2 overflow-auto p-4 text-sm">
        <p className="font-medium text-gray-200">
          {artistName}
          {songTitle ? ` - ${songTitle}` : ''}
        </p>
        <p className="text-xs text-gray-500">
          music8 に登録がありません（テスト表示）
        </p>
        <ReferencedMusicDataDisclaimer />
      </div>
    );
  }

  const lines = formatMusic8ArtistDisplayLines(data);
  const hasBasicInfo =
    lines.nameDisplay ||
    lines.occupationDisplay ||
    lines.memberDisplay ||
    lines.origin ||
    lines.activeYears ||
    lines.bornFormatted ||
    lines.diedFormatted;

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4 text-sm">
      <div className="flex flex-shrink-0 gap-4">
        {lines.imageUrl && (
          // Music8 の外部 URL は next.config に remotePatterns が無いため img のまま
          // eslint-disable-next-line @next/next/no-img-element -- 動的外部ドメイン
          <img
            src={lines.imageUrl}
            alt=""
            className="h-28 w-28 flex-shrink-0 rounded object-cover"
          />
        )}
        <div className="min-w-0 flex-1 space-y-2 text-gray-300">
          {lines.nameDisplay && (
            <p className="flex flex-wrap items-center gap-2 font-medium text-gray-200">
              <span>
                {lines.nameDisplay}
                {lines.origin ? ` (${lines.origin})` : ''}
              </span>
              {libraryMainArtist && onOpenLibraryForArtist && (
                <button
                  type="button"
                  onClick={() => onOpenLibraryForArtist(libraryMainArtist, { music8Artist: data })}
                  className="shrink-0 rounded border border-lime-500/60 bg-lime-900/25 px-2 py-0.5 text-xs font-medium text-lime-100 hover:bg-lime-900/40"
                  title="ライブラリでこのアーティストの曲一覧を開く"
                >
                  ライブラリ
                </button>
              )}
            </p>
          )}
          {lines.occupationDisplay && (
            <p className="text-gray-300 lowercase">
              {lines.occupationDisplay}
            </p>
          )}
          {lines.activeYears && (
            <p>
              活動期間：{(() => {
                const ay = lines.activeYears.trim();
                return ay.match(/ -$/) ? `${ay} /` : ay;
              })()}
            </p>
          )}
          {lines.bornFormatted && (
            <p>生年月日：{lines.bornFormatted}</p>
          )}
          {lines.memberDisplay && (
            <p>メンバー：{lines.memberDisplay}</p>
          )}
          {lines.diedFormatted && (
            <p className="text-gray-400">{lines.diedFormatted}</p>
          )}
          {lines.youtubeChannelHref && (
            <p className="pt-1">
              <a
                href={lines.youtubeChannelHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-2 text-sky-400 hover:text-sky-300 hover:underline"
                aria-label={`${lines.nameDisplay} の YouTube チャンネル（別タブ）`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- ローカル静的 SVG */}
                <img
                  src="/svg/youtube.svg"
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5 shrink-0"
                />
                <span className="min-w-0 break-words">{lines.nameDisplay} YouTube Channel</span>
              </a>
            </p>
          )}
          {!hasBasicInfo && !lines.imageUrl && !lines.youtubeChannelHref && (
            <p className="text-gray-500">基本情報なし</p>
          )}
        </div>
      </div>
      {lines.descriptionJa && (
        <p
          className="w-full flex-shrink-0 border-t border-gray-700/80 pt-3 whitespace-pre-wrap text-gray-300"
          style={{ lineHeight: 1.7 }}
        >
          {lines.descriptionJa}
        </p>
      )}
      <ReferencedMusicDataDisclaimer />
    </div>
  );
}
