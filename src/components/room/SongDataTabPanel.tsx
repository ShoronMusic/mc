'use client';

/**
 * ソングデータタブの内容。Music8 曲 JSON から取得し、上から順に
 * リリース・スタイル・ジャンル・ボーカル・説明文（全文）を表示する。
 */

import { useEffect, useState } from 'react';
import { showRoomStyleUi } from '@/lib/product-branding';
import { formatLibraryVocalDisplay } from '@/lib/library-vocal-display';
import { resolveSongTitleForMusic8 } from '@/lib/music8-song-lookup';
import {
  extractMusic8SongFields,
  pickMusic8SongFullDescription,
  preferFullerMusic8Description,
  type Music8SongExtract,
} from '@/lib/music8-song-fields';
import { ReferencedMusicDataDisclaimer } from '@/components/room/ReferencedMusicDataDisclaimer';

function mergeSongExtracts(parts: Music8SongExtract[]): Music8SongExtract | null {
  if (parts.length === 0) return null;
  const out: Music8SongExtract = { ...parts[0] };
  for (const p of parts.slice(1)) {
    if (!out.releaseDate && p.releaseDate) out.releaseDate = p.releaseDate;
    if (p.genres.length > out.genres.length) out.genres = p.genres;
    if (p.styleNames.length > out.styleNames.length) {
      out.styleIds = p.styleIds;
      out.styleNames = p.styleNames;
    }
    if (!out.vocalLabel && p.vocalLabel) out.vocalLabel = p.vocalLabel;
    if (!out.structuredStyleFromFacts && p.structuredStyleFromFacts) {
      out.structuredStyleFromFacts = p.structuredStyleFromFacts;
    }
  }
  return out;
}

async function fetchSongJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, { credentials: 'include' });
  const json = (await res.json().catch(() => ({}))) as { song?: unknown };
  return json?.song && typeof json.song === 'object' ? json.song : null;
}

interface SongDataTabPanelProps {
  artistName: string;
  songTitle: string | null;
  /** 指定時は musicaichat/v1（YouTube ID）で先に曲 JSON を取り、従来 songs/ より優先 */
  videoId?: string | null;
}

export default function SongDataTabPanel({
  artistName,
  songTitle,
  videoId = null,
}: SongDataTabPanelProps) {
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
    const vid = (videoId ?? '').trim();
    (async () => {
      try {
        const tasks: Promise<unknown | null>[] = [];
        if (vid) {
          tasks.push(
            fetchSongJson(`/api/music8/musicaichat-by-video?videoId=${encodeURIComponent(vid)}`),
          );
        }
        tasks.push(
          fetchSongJson(
            `/api/music8/song-by-playback?artistName=${encodeURIComponent(artistName)}&songTitle=${encodeURIComponent(songTitle ?? '')}`,
          ),
        );
        const songs = (await Promise.all(tasks)).filter((s): s is Record<string, unknown> =>
          Boolean(s && typeof s === 'object'),
        );
        if (songs.length === 0) {
          setFields(null);
          setError(true);
          return;
        }
        const merged = mergeSongExtracts(songs.map((s) => extractMusic8SongFields(s)));
        let description = '';
        for (const s of songs) {
          description = preferFullerMusic8Description(description, pickMusic8SongFullDescription(s));
        }
        if (!merged) {
          setFields(null);
          setError(true);
          return;
        }
        setFields({ ...merged, description });
        setError(false);
      } catch {
        setFields(null);
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [artistName, songTitle, videoId]);

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

  const vocalDisplay = formatLibraryVocalDisplay(fields.vocalLabel);
  const showStyleUi = showRoomStyleUi();
  const descriptionForDisplay =
    showStyleUi || !fields.description
      ? fields.description
      : fields.description
          .replace(/\r\n/g, '\n')
          .split('\n')
          .filter(
            (line) =>
              !/^\s*スタイル\s*(?:\([^)]*\))?\s*[:：]/.test(line) &&
              !/^\s*Style\s*(?:\([^)]*\))?\s*[:：]/i.test(line),
          )
          .join('\n')
          .trim();

  const hasAny =
    fields.releaseDate ||
    (showStyleUi && fields.styleNames.length > 0) ||
    fields.genres.length > 0 ||
    vocalDisplay ||
    descriptionForDisplay;

  if (!hasAny) {
    return (
      <div className="flex h-full flex-col gap-2 overflow-auto p-4 text-sm">
        <p className="font-medium text-gray-200">
          {artistName}
          {displaySong ? ` - ${displaySong}` : ''}
        </p>
        <p className="text-xs text-gray-500">
          {showStyleUi
            ? 'リリース・スタイル・ジャンル・説明文はいずれもありません'
            : 'リリース・ジャンル・説明文はいずれもありません'}
        </p>
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
      {showStyleUi && fields.styleNames.length > 0 && (
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
      {vocalDisplay && (
        <p className="text-gray-200">
          <span className="text-gray-500">ボーカル：</span>
          {vocalDisplay}
        </p>
      )}
      {descriptionForDisplay ? (
        <p className="whitespace-pre-wrap break-words text-gray-300 leading-relaxed">
          {descriptionForDisplay}
        </p>
      ) : null}
      <ReferencedMusicDataDisclaimer />
    </div>
  );
}
