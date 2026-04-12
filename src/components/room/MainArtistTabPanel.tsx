'use client';

/**
 * メインアーティストタブの内容。music8 の JSON を取得して表示（テスト実装）。
 */

import { useEffect, useState } from 'react';
import {
  formatMusic8ArtistDisplayLines,
  getMusic8ArtistJsonUrl,
  type Music8ArtistJson,
} from '@/lib/music8-artist-display';
import { ReferencedMusicDataDisclaimer } from '@/components/room/ReferencedMusicDataDisclaimer';

interface MainArtistTabPanelProps {
  artistName: string;
  songTitle: string | null;
}

export default function MainArtistTabPanel({ artistName, songTitle }: MainArtistTabPanelProps) {
  const [data, setData] = useState<Music8ArtistJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!artistName?.trim()) {
      setData(null);
      setLoading(false);
      setError(false);
      return;
    }
    const url = getMusic8ArtistJsonUrl(artistName);
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Not found'))))
      .then((json) => {
        setData(json as Music8ArtistJson);
        setError(false);
      })
      .catch(() => {
        setData(null);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [artistName]);

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
            <p className="font-medium text-gray-200">
              {lines.nameDisplay}
              {lines.origin ? ` (${lines.origin})` : ''}
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
