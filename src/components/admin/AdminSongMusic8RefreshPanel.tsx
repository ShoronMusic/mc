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
      <h3 className="text-sm font-semibold text-cyan-200">Music8 スナップショット</h3>
      <p className="mt-2 text-xs leading-relaxed text-gray-400">
        ① <strong className="text-gray-300">再取得</strong>: musicaichat 索引 → GCS 曲 JSON → 見つからなければ{' '}
        <strong className="text-gray-300">WordPress REST</strong> を自動フォールバック。
        ② <strong className="text-gray-300">WP REST から補完</strong>: JSON ファイル未エクスポートでも、WP
        に登録済みなら <code className="text-gray-500">wp/v2/posts</code> から genres / Spotify / slug 等を取り込みます。
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
