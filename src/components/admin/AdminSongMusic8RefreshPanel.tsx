'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  songId: string;
};

export function AdminSongMusic8RefreshPanel({ songId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleRefresh() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/song-music8-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        setMsg(data?.error || '再取得に失敗しました。');
        return;
      }
      router.refresh();
    } catch {
      setMsg('再取得に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded border border-cyan-900/50 bg-cyan-950/15 p-3">
      <h3 className="text-sm font-semibold text-cyan-200">Music8 スナップショット</h3>
      <p className="mt-2 text-xs leading-relaxed text-gray-400">
        選曲 AI と同じ経路（musicaichat の YouTube 索引 → 曲 JSON、なければ GCS のアーティスト＋曲名フォールバック）で{' '}
        <code className="text-gray-500">music8_song_data</code> を上書き保存します。紐づく動画があればその{' '}
        <code className="text-gray-500">video_id</code> を使います。メタはメインアーティスト＋曲タイトル、または{' '}
        <code className="text-gray-500">display_title</code> から解決します。
      </p>
      {msg && (
        <p className="mt-2 text-xs text-amber-300" role="alert">
          {msg}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleRefresh()}
        className="mt-3 rounded bg-cyan-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? '取得中…' : 'Music8 スナップショットを再取得'}
      </button>
    </div>
  );
}
