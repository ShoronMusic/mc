'use client';

/**
 * ソングデータタブの内容。Music8 曲 JSON から取得し、上から順に
 * リリース・スタイル・ジャンル・説明文 を表示する。
 */

import { useEffect, useState } from 'react';
import {
  resolveSongTitleForMusic8,
} from '@/lib/music8-song-lookup';
import { extractMusic8SongFields, type Music8SongExtract } from '@/lib/music8-song-fields';
import { ReferencedMusicDataDisclaimer } from '@/components/room/ReferencedMusicDataDisclaimer';

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** musicaichat のプレーン行（ジャンル： … 等）の項目名をリリース行と同じグレーにする */
const ITEM_LABEL_LINE =
  /^(\s*(?:ジャンル|スタイル|ボーカル|Genre|Style|Vocals?)(?:\s*\([^)]*\))?\s*[:：]\s*)([\s\S]*)$/;

function formatSongDataDescriptionMarkup(raw: string): string {
  const t = (raw ?? '').replace(/\r\n/g, '\n');
  if (!t.trim()) return '';
  if (/<[a-zA-Z!?/]/.test(t)) {
    return t;
  }
  return t
    .split('\n')
    .map((line) => {
      const m = line.match(ITEM_LABEL_LINE);
      if (m) {
        return `<span class="text-gray-500">${escapeHtmlText(m[1])}</span>${escapeHtmlText(m[2])}`;
      }
      return escapeHtmlText(line);
    })
    .join('\n');
}

/** 説明文内に個別のジャンル／スタイル行があるときは、上部の「スタイル：…」「ジャンル：…」集約と重複するため非表示にする */
function descriptionImpliesStructuredGenreOrStyle(description: string): boolean {
  const t = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  // 「ジャンル (Genre):」のように括弧が挟まる表記も拾う
  const jpGenre = /ジャンル\s*(?:\([^)]*\))?\s*[:：]/.test(t);
  const jpStyle = /スタイル\s*(?:\([^)]*\))?\s*[:：]/.test(t);
  return jpGenre || jpStyle || /\bGenre\s*:/i.test(t) || /\bStyle\s*:/i.test(t);
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
        if (vid) {
          const mr = await fetch(
            `/api/music8/musicaichat-by-video?videoId=${encodeURIComponent(vid)}`,
            { credentials: 'include' },
          );
          const mj = (await mr.json().catch(() => ({}))) as { song?: unknown };
          if (mj?.song && typeof mj.song === 'object') {
            setFields(extractMusic8SongFields(mj.song));
            setError(false);
            return;
          }
        }
        const sr = await fetch(
          `/api/music8/song-by-playback?artistName=${encodeURIComponent(artistName)}&songTitle=${encodeURIComponent(songTitle ?? '')}`,
          { credentials: 'include' },
        );
        const sj = (await sr.json().catch(() => ({}))) as { song?: unknown };
        if (sj?.song && typeof sj.song === 'object') {
          setFields(extractMusic8SongFields(sj.song));
          setError(false);
        } else {
          setFields(null);
          setError(true);
        }
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

  const hideAggregatedStyleGenre = descriptionImpliesStructuredGenreOrStyle(fields.description);

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4 text-sm">
      {fields.releaseDate && (
        <p className="text-gray-200">
          <span className="text-gray-500">リリース：</span>
          {fields.releaseDate}
        </p>
      )}
      {!hideAggregatedStyleGenre && fields.styleNames.length > 0 && (
        <p className="text-gray-200">
          <span className="text-gray-500">スタイル：</span>
          {fields.styleNames.join(', ')}
        </p>
      )}
      {!hideAggregatedStyleGenre && fields.genres.length > 0 && (
        <p className="text-gray-200">
          <span className="text-gray-500">ジャンル：</span>
          {fields.genres.join(', ')}
        </p>
      )}
      {fields.description && (
        <div
          className="prose prose-invert max-w-none whitespace-pre-wrap text-gray-300 prose-strong:text-gray-500 prose-p:my-1 prose-p:leading-relaxed prose-a:text-blue-400"
          dangerouslySetInnerHTML={{ __html: formatSongDataDescriptionMarkup(fields.description) }}
        />
      )}
      <ReferencedMusicDataDisclaimer />
    </div>
  );
}
