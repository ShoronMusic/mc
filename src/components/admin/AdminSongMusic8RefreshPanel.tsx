'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  songId: string;
};

export function AdminSongMusic8RefreshPanel({ songId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'idle' | 'refresh' | 'wp'>('idle');
  const [msg, setMsg] = useState<string | null>(null);

  async function runImport(path: '/api/admin/song-music8-refresh' | '/api/admin/song-music8-wp-rest-import') {
    setMsg(null);
    setBusy(path.endsWith('wp-rest-import') ? 'wp' : 'refresh');
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; source?: string };
      if (!res.ok) {
        setMsg(data?.error || '取得に失敗しました。');
        return;
      }
      if (data.source === 'wp_rest') {
        setMsg('WordPress REST から補完しました。');
      }
      router.refresh();
    } catch {
      setMsg('取得に失敗しました。');
    } finally {
      setBusy('idle');
    }
  }

  return (
    <div className="mt-4 rounded border border-cyan-900/50 bg-cyan-950/15 p-3">
      <h3 className="text-sm font-semibold text-cyan-200">music8_song_data（空欄のときだけ）</h3>
      <p className="mt-2 text-xs leading-relaxed text-gray-400">
        正本は <code className="text-gray-500">songs</code> の列です。公開 JSON や WP
        から戻すと手修正を上書きすることがあるので、日常の編集には使いません。
        スナップショットが空で曲解説用キャッシュだけ埋めたいとき用です。
      </p>
      {msg && (
        <p className="mt-2 text-xs text-amber-300" role="alert">
          {msg}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== 'idle'}
          onClick={() => void runImport('/api/admin/song-music8-refresh')}
          className="rounded bg-cyan-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'refresh' ? '取得中…' : 'Music8 スナップショットを再取得'}
        </button>
        <button
          type="button"
          disabled={busy !== 'idle'}
          onClick={() => void runImport('/api/admin/song-music8-wp-rest-import')}
          className="rounded border border-cyan-700 bg-gray-950 px-3 py-1.5 text-sm font-medium text-cyan-100 hover:bg-cyan-950/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'wp' ? '取得中…' : 'WP REST から補完'}
        </button>
      </div>
    </div>
  );
}
