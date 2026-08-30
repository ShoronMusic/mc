'use client';

import { useEffect, useState } from 'react';
import { stripDbPrefixForChatDisplay } from '@/lib/ai-commentary-chat-display';
import { stripGemma4CommentaryHeadPrefix } from '@/lib/commentary-model-head-tag';
import { polishGemmaModelVisibleText } from '@/lib/gemini-gemma-host';
import { fetchMusic8SongDescription } from '@/components/chat/LibraryMusic8SongComment';

type LibrarySongCommentaryProps = {
  videoId: string | null;
  songId?: string | null;
  artistName?: string | null;
  songTitle?: string | null;
};

function toDisplayBody(raw: string): string {
  let t = stripGemma4CommentaryHeadPrefix(raw.trim());
  t = stripDbPrefixForChatDisplay(t);
  if (t.startsWith('[NEW] ')) t = t.slice(6);
  else if (t.startsWith('[NEW]')) t = t.slice(5).replace(/^\s+/, '');
  t = t.replace(/^\[Music8[^\]]*\]\s*/i, '').trimStart();
  t = polishGemmaModelVisibleText(t);
  return t.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

async function fetchAiCommentary(videoId: string | null, songId: string | null): Promise<string | null> {
  const vid = (videoId ?? '').trim();
  const sid = (songId ?? '').trim();
  if (!vid && !sid) return null;
  const params = new URLSearchParams();
  if (vid) params.set('videoId', vid);
  if (sid) params.set('songId', sid);
  const res = await fetch(`/api/library/ai-commentary?${params.toString()}`, {
    credentials: 'include',
  });
  const json = (await res.json().catch(() => ({}))) as {
    found?: boolean;
    baseComment?: string | null;
  };
  const body = typeof json.baseComment === 'string' ? toDisplayBody(json.baseComment) : '';
  return json.found && body ? body : null;
}

/**
 * ライブラリ曲詳細の「曲解説」1枠。
 * Music8 曲紹介があればそれを優先し、無いときだけ保存済み AI 曲解説を出す。
 */
export function LibrarySongCommentary({
  videoId,
  songId,
  artistName,
  songTitle,
}: LibrarySongCommentaryProps) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const vid = (videoId ?? '').trim();
    const sid = (songId ?? '').trim();
    const artist = (artistName ?? '').trim();
    const title = (songTitle ?? '').trim();
    const canMusic8 = Boolean(vid || (artist && title));
    const canAi = Boolean(vid || sid);
    if (!canMusic8 && !canAi) {
      setText(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setText(null);

    void (async () => {
      try {
        const [music8, ai] = await Promise.all([
          canMusic8 ? fetchMusic8SongDescription(vid || null, artist, title) : Promise.resolve(null),
          canAi ? fetchAiCommentary(vid || null, sid || null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const chosen = music8 || ai || null;
        setText(chosen ? chosen.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim() : null);
      } catch {
        if (!cancelled) setText(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [videoId, songId, artistName, songTitle]);

  if (!loading && !text) return null;

  return (
    <div className="mt-3 shrink-0 overflow-visible border-t border-gray-800 pt-3 pb-2">
      <p className="text-[11px] font-medium text-gray-500">曲解説</p>
      {loading ? (
        <p className="mt-1.5 text-xs text-gray-500">読み込み中…</p>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-300">
          {text}
        </p>
      )}
    </div>
  );
}
