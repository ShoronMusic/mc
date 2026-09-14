'use client';

/**
 * ソングデータタブの内容。Music8 曲 JSON から取得し、上から順に
 * リリース・スタイル・ジャンル・ボーカル・説明文（全文）を表示する。
 */

import { useEffect, useState } from 'react';
import { SongCoverThumb } from '@/components/song/SongCoverThumb';
import { ReferencedMusicDataDisclaimer } from '@/components/room/ReferencedMusicDataDisclaimer';
import { formatLibraryVocalDisplay } from '@/lib/library-vocal-display';
import { resolveSongTitleForMusic8 } from '@/lib/music8-song-lookup';
import {
  extractMusic8SongFields,
  filterMusic8GenreLabels,
  mergeMusic8SongExtracts,
  pickMusic8SongFullDescription,
  preferFullerMusic8Description,
  resolveSongStyleForOverwriteFromMusic8,
  type Music8SongExtract,
} from '@/lib/music8-song-fields';
import { showRoomStyleUi } from '@/lib/product-branding';
import { resolveSongCoverImage } from '@/lib/song-cover-image';

async function fetchSongJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, { credentials: 'include' });
  const json = (await res.json().catch(() => ({}))) as { song?: unknown };
  return json?.song && typeof json.song === 'object' ? json.song : null;
}

async function fetchDbSongCover(videoId: string): Promise<{
  spotifyImages: string;
  style: string;
  genres: string[];
  vocal: string;
} | null> {
  const res = await fetch(
    `/api/library/song-by-video?videoId=${encodeURIComponent(videoId)}&coverOnly=1`,
    { credentials: 'include' },
  );
  const json = (await res.json().catch(() => ({}))) as {
    song?: {
      spotify_images?: string | null;
      style?: string | null;
      genres?: string | null;
      vocal?: string | null;
    } | null;
  };
  if (!res.ok || !json?.song) return null;
  const genres = filterMusic8GenreLabels(
    (json.song.genres ?? '')
      .split(/\s*[,、]\s*/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return {
    spotifyImages: (json.song.spotify_images ?? '').trim(),
    style: (json.song.style ?? '').trim(),
    genres,
    vocal: (json.song.vocal ?? '').trim(),
  };
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
        const dbCoverTask = vid ? fetchDbSongCover(vid) : Promise.resolve(null);
        const songs = (await Promise.all(tasks)).filter((s): s is Record<string, unknown> =>
          Boolean(s && typeof s === 'object'),
        );
        const dbCover = await dbCoverTask;
        if (songs.length === 0) {
          setFields(null);
          setError(true);
          return;
        }
        const merged = mergeMusic8SongExtracts(songs.map((s) => extractMusic8SongFields(s)));
        let description = '';
        for (const s of songs) {
          description = preferFullerMusic8Description(description, pickMusic8SongFullDescription(s));
        }
        if (!merged) {
          setFields(null);
          setError(true);
          return;
        }
        if (dbCover?.spotifyImages) merged.spotifyImages = dbCover.spotifyImages;
        if (dbCover?.style) {
          merged.structuredStyleFromFacts = dbCover.style;
          if (merged.styleNames.length === 0) merged.styleNames = [dbCover.style];
        }
        if (dbCover && dbCover.genres.length > 0) merged.genres = dbCover.genres;
        if (dbCover?.vocal) merged.vocalLabel = dbCover.vocal;
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
  const styleDisplay = showStyleUi
    ? resolveSongStyleForOverwriteFromMusic8(fields) || fields.styleNames.join(', ')
    : '';
  const genreDisplay = fields.genres.join(', ');
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

  const coverSpotify = fields.spotifyImages || null;
  const coverVideoId = (videoId ?? '').trim() || fields.youtubeVideoId || null;
  const cover = resolveSongCoverImage({
    spotifyImages: coverSpotify,
    videoId: coverVideoId,
  });

  const hasAny =
    Boolean(cover.url) ||
    fields.releaseDate ||
    (showStyleUi && styleDisplay) ||
    genreDisplay ||
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
    <div className="h-full overflow-auto p-3 text-sm">
      <section className="overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.9)]">
        <div className="flex gap-4 p-3 sm:p-4">
          {cover.url ? (
            <SongCoverThumb
              spotifyImages={coverSpotify}
              videoId={coverVideoId}
              alt={cover.source === 'spotify' ? '曲ジャケット' : '曲サムネ'}
              className="h-28 w-28 rounded-lg border border-gray-700"
            />
          ) : null}
          <div className="min-w-0 flex-1 space-y-1.5 text-gray-200">
            {fields.releaseDate ? (
              <p>
                <span className="text-gray-500">リリース：</span>
                {fields.releaseDate}
              </p>
            ) : null}
            {showStyleUi && styleDisplay ? (
              <p>
                <span className="text-gray-500">スタイル：</span>
                {styleDisplay}
              </p>
            ) : null}
            {genreDisplay ? (
              <p>
                <span className="text-gray-500">ジャンル：</span>
                {genreDisplay}
              </p>
            ) : null}
            {vocalDisplay ? (
              <p>
                <span className="text-gray-500">ボーカル：</span>
                {vocalDisplay}
              </p>
            ) : null}
          </div>
        </div>
        {descriptionForDisplay ? (
          <p className="whitespace-pre-wrap break-words border-t border-gray-800 px-3 py-3 leading-relaxed text-gray-300 sm:px-4">
            {descriptionForDisplay}
          </p>
        ) : null}
      </section>
      <ReferencedMusicDataDisclaimer />
    </div>
  );
}
