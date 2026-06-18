'use client';

import { useEffect, useState } from 'react';
import { extractMusic8SongFields } from '@/lib/music8-song-fields';

type LibraryMusic8SongCommentProps = {
  videoId: string | null;
  artistName: string | null;
  songTitle: string | null;
};

/** Music8 旧 JSON の HTML content 等をプレーンテキストにする */
function music8DescriptionToPlainText(raw: string): string {
  const withBreaks = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n');
  if (typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.innerHTML = withBreaks;
    return (el.textContent ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return withBreaks.replace(/<[^>]+>/g, '').trim();
}

function normalizeMusic8Description(raw: string | null | undefined): string | null {
  const plain = music8DescriptionToPlainText((raw ?? '').trim());
  return plain || null;
}

async function fetchMusic8SongDescription(
  videoId: string | null,
  artistName: string,
  songTitle: string,
): Promise<string | null> {
  const vid = (videoId ?? '').trim();
  if (vid) {
    const res = await fetch(`/api/music8/musicaichat-by-video?videoId=${encodeURIComponent(vid)}`, {
      credentials: 'include',
    });
    const json = (await res.json().catch(() => ({}))) as { song?: unknown };
    if (json?.song && typeof json.song === 'object') {
      const desc = normalizeMusic8Description(extractMusic8SongFields(json.song).description);
      if (desc) return desc;
    }
  }
  if (!artistName || !songTitle) return null;
  const res = await fetch(
    `/api/music8/song-by-playback?artistName=${encodeURIComponent(artistName)}&songTitle=${encodeURIComponent(songTitle)}`,
    { credentials: 'include' },
  );
  const json = (await res.json().catch(() => ({}))) as { song?: unknown };
  if (json?.song && typeof json.song === 'object') {
    return normalizeMusic8Description(extractMusic8SongFields(json.song).description);
  }
  return null;
}

/** ライブラリ曲詳細：Music8 JSON の曲紹介文（facts_for_ai / content） */
export function LibraryMusic8SongComment({
  videoId,
  artistName,
  songTitle,
}: LibraryMusic8SongCommentProps) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const artist = (artistName ?? '').trim();
    const title = (songTitle ?? '').trim();
    const vid = (videoId ?? '').trim();
    if (!vid && (!artist || !title)) {
      setText(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setText(null);

    void (async () => {
      try {
        const desc = await fetchMusic8SongDescription(vid || null, artist, title);
        if (!cancelled) setText(desc);
      } catch {
        if (!cancelled) setText(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [videoId, artistName, songTitle]);

  if (!loading && !text) return null;

  return (
    <div className="mt-3 border-t border-gray-800 pt-3">
      <p className="text-[11px] font-medium text-gray-500">Music8 曲紹介コメント</p>
      {loading ? (
        <p className="mt-1.5 text-xs text-gray-500">読み込み中…</p>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-gray-400">{text}</p>
      )}
    </div>
  );
}
