'use client';

/**
 * ソングデータタブの内容。Music8 曲 JSON から取得し、上から順に
 * リリース・スタイル・ジャンル・説明文 を表示する。
 */

import { useEffect, useState } from 'react';
import {
  fetchMusic8SongDataForPlaybackRow,
  resolveSongTitleForMusic8,
} from '@/lib/music8-song-lookup';
import { extractMusic8SongFields, type Music8SongExtract } from '@/lib/music8-song-fields';
import { ReferencedMusicDataDisclaimer } from '@/components/room/ReferencedMusicDataDisclaimer';

interface SongDataTabPanelProps {
  artistName: string;
  songTitle: string | null;
}

export default function SongDataTabPanel({ artistName, songTitle }: SongDataTabPanelProps) {
  const [fields, setFields] = useState<Music8SongExtract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!artistName?.trim()) {
      setFields(null);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    fetchMusic8SongDataForPlaybackRow(artistName, songTitle ?? '')
      .then((data) => {
        if (data) {
          setFields(extractMusic8SongFields(data));
          setError(false);
        } else {
          setFields(null);
          setError(true);
        }
      })
      .catch(() => {
        setFields(null);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [artistName, songTitle]);

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

  const displaySong =
    songTitle && artistName
      ? resolveSongTitleForMusic8(artistName, songTitle) || songTitle
      : songTitle;

  if (error || !fields) {
    const query = [artistName, displaySong].filter(Boolean).join(' ');
    const googleUrl =
      query && `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    const wikipediaUrl =
      query && `https://ja.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}`;
    const musicBrainzUrl =
      query && `https://musicbrainz.org/search?type=recording&advanced=0&query=${encodeURIComponent(query)}`;

    return (
      <div className="flex h-full flex-col gap-3 overflow-auto p-4 text-sm">
        <div>
          <p className="font-medium text-gray-200">
            {artistName}
            {displaySong ? ` - ${displaySong}` : ''}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            music8 にこの曲のデータがありません。
          </p>
        </div>
        {query && (
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <span className="mt-1 text-gray-500">代わりに外部サイトで調べる：</span>
            {googleUrl && (
              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-700"
              >
                Google 検索
              </a>
            )}
            {wikipediaUrl && (
              <a
                href={wikipediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-700"
              >
                Wikipedia
              </a>
            )}
            {musicBrainzUrl && (
              <a
                href={musicBrainzUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-700"
              >
                MusicBrainz
              </a>
            )}
          </div>
        )}
        <ReferencedMusicDataDisclaimer />
      </div>
    );
  }

  const hasAny =
    fields.releaseDate ||
    fields.styleNames.length > 0 ||
    fields.genres.length > 0 ||
    fields.description;

  if (!hasAny) {
    return (
      <div className="flex h-full flex-col gap-2 overflow-auto p-4 text-sm">
        <p className="font-medium text-gray-200">
          {artistName}
          {displaySong ? ` - ${displaySong}` : ''}
        </p>
        <p className="text-xs text-gray-500">リリース・スタイル・ジャンル・説明文はいずれもありません</p>
        <ReferencedMusicDataDisclaimer />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4 text-sm">
      {fields.releaseDate && (
        <p className="text-gray-200">
          <span className="text-gray-500">リリース：</span>
          {fields.releaseDate}
        </p>
      )}
      {fields.styleNames.length > 0 && (
        <p className="text-gray-200">
          <span className="text-gray-500">スタイル：</span>
          {fields.styleNames.join(', ')}
        </p>
      )}
      {fields.genres.length > 0 && (
        <p className="text-gray-200">
          <span className="text-gray-500">ジャンル：</span>
          {fields.genres.join(', ')}
        </p>
      )}
      {fields.description && (
        <div
          className="prose prose-invert max-w-none whitespace-pre-wrap text-gray-300 prose-p:my-1 prose-p:leading-relaxed prose-a:text-blue-400"
          dangerouslySetInnerHTML={{ __html: fields.description }}
        />
      )}
      <ReferencedMusicDataDisclaimer />
    </div>
  );
}
