'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  songId: string;
  initialDisplayTitle: string | null;
  initialMainArtist: string | null;
  initialSongTitle: string | null;
  initialStyle: string | null;
  initialOriginalReleaseDate: string | null;
};

export function AdminSongBasicInfoEditPanel({
  songId,
  initialDisplayTitle,
  initialMainArtist,
  initialSongTitle,
  initialStyle,
  initialOriginalReleaseDate,
}: Props) {
  const router = useRouter();
  const [displayTitle, setDisplayTitle] = useState(initialDisplayTitle ?? '');
  const [mainArtist, setMainArtist] = useState(initialMainArtist ?? '');
  const [songTitle, setSongTitle] = useState(initialSongTitle ?? '');
  const [style, setStyle] = useState(initialStyle ?? '');
  const [originalReleaseDate, setOriginalReleaseDate] = useState(initialOriginalReleaseDate ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/song-master-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId,
          displayTitle,
          mainArtist,
          songTitle,
          style,
          originalReleaseDate,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(data.error || '保存に失敗しました。');
        return;
      }
      setMsg('保存しました。');
      router.refresh();
    } catch {
      setMsg('保存に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded border border-emerald-900/50 bg-emerald-950/15 p-3">
      <h3 className="text-sm font-semibold text-emerald-200">基本情報の修正（songs）</h3>
      <p className="mt-2 text-xs text-gray-400">
        display_title / メインアーティスト / 曲タイトル / スタイル / original_release_date（原盤）を更新します。
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-gray-400">
          display_title
          <input
            type="text"
            value={displayTitle}
            onChange={(e) => setDisplayTitle(e.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-emerald-700 focus:outline-none"
          />
        </label>
        <label className="block text-xs text-gray-400">
          メインアーティスト
          <input
            type="text"
            value={mainArtist}
            onChange={(e) => setMainArtist(e.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-emerald-700 focus:outline-none"
          />
        </label>
        <label className="block text-xs text-gray-400">
          曲タイトル
          <input
            type="text"
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-emerald-700 focus:outline-none"
          />
        </label>
        <label className="block text-xs text-gray-400">
          スタイル
          <input
            type="text"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-emerald-700 focus:outline-none"
          />
        </label>
        <label className="block text-xs text-gray-400 sm:col-span-2">
          original_release_date（原盤）
          <input
            type="date"
            value={originalReleaseDate}
            onChange={(e) => setOriginalReleaseDate(e.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-emerald-700 focus:outline-none"
          />
        </label>
      </div>

      {msg ? (
        <p className="mt-2 text-xs text-emerald-300" role="status">
          {msg}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void handleSave()}
        className="mt-3 rounded bg-emerald-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? '保存中…' : '基本情報を保存'}
      </button>
    </div>
  );
}
