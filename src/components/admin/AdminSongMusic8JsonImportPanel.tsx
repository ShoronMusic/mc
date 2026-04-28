'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  songId: string;
  /** songs.music8_artist_slug + music8_song_slug から URL を自動生成するためのヒント */
  music8ArtistSlug?: string | null;
  music8SongSlug?: string | null;
  /** Music8 曲 JSON のベース URL（環境変数 MUSIC8_SONGS_BASE 相当） */
  music8SongsBaseUrl?: string;
};

const DEFAULT_BASE = 'https://xs867261.xsrv.jp/data/data/songs';

export function AdminSongMusic8JsonImportPanel({
  songId,
  music8ArtistSlug,
  music8SongSlug,
  music8SongsBaseUrl,
}: Props) {
  const router = useRouter();
  const base = (music8SongsBaseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
  const derivedUrl =
    music8ArtistSlug?.trim() && music8SongSlug?.trim()
      ? `${base}/${music8ArtistSlug.trim()}_${music8SongSlug.trim()}.json`
      : '';

  const [jsonUrl, setJsonUrl] = useState(derivedUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleImport() {
    const url = jsonUrl.trim();
    if (!url) return;
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/song-music8-json-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId, jsonUrl: url }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; snapKind?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: data?.error ?? '取り込みに失敗しました。' });
        return;
      }
      setMsg({ ok: true, text: `取り込み完了（${data.snapKind ?? 'ok'}）。ページを更新します…` });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: '取り込みに失敗しました。' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded border border-amber-900/50 bg-amber-950/15 p-3">
      <h3 className="text-sm font-semibold text-amber-200">Music8 JSON 直接取り込み</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
        Music8 曲 JSON の URL を指定して直接取り込みます。
        取り込み後、<code className="text-gray-500">songs</code> の詳細メタ（genres / vocal / Spotify / スラッグ）と
        <code className="text-gray-500"> artists</code> の Spotify 情報が更新されます。
      </p>
      <div className="mt-2 flex gap-2">
        <input
          type="url"
          value={jsonUrl}
          onChange={(e) => setJsonUrl(e.target.value)}
          placeholder={`例: ${DEFAULT_BASE}/police_every-breath-you-take.json`}
          className="flex-1 rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:border-amber-500 focus:outline-none"
        />
        <button
          type="button"
          disabled={busy || !jsonUrl.trim()}
          onClick={() => void handleImport()}
          className="rounded bg-amber-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '取得中…' : '取り込む'}
        </button>
      </div>
      {derivedUrl && jsonUrl !== derivedUrl && (
        <button
          type="button"
          onClick={() => setJsonUrl(derivedUrl)}
          className="mt-1.5 text-[11px] text-amber-400 hover:underline"
        >
          スラッグから自動生成した URL に戻す: {derivedUrl}
        </button>
      )}
      {msg && (
        <p
          className={`mt-2 text-xs ${msg.ok ? 'text-emerald-300' : 'text-amber-300'}`}
          role="alert"
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
