'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { MUSIC8_NAV_STYLE_SLUGS } from '@/lib/music8-catalog-slugs';
import type { AdminSongsRegisterResponse } from '@/app/api/admin/songs-register/route';

export function AdminNewSongForm() {
  const params = useSearchParams();
  const initialYoutube = params.get('youtube_id') ?? params.get('youtubeId') ?? '';
  const initialArtist = params.get('artist') ?? '';
  const initialTitle = params.get('title') ?? '';
  const fromYoutube = params.get('from') === 'youtube';

  const [youtubeId, setYoutubeId] = useState(initialYoutube);
  const [artist, setArtist] = useState(initialArtist);
  const [title, setTitle] = useState(initialTitle);
  const [style, setStyle] = useState('pop');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [songId, setSongId] = useState<string | null>(null);

  const previewUrl = useMemo(() => {
    const id = youtubeId.trim();
    const m = id.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
    const vid = m?.[1] ?? (/^[A-Za-z0-9_-]{11}$/.test(id) ? id : '');
    return vid ? `https://www.youtube.com/watch?v=${vid}` : null;
  }, [youtubeId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setSongId(null);
    try {
      const res = await fetch('/api/admin/songs-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          youtube_id: youtubeId,
          artist,
          title,
          style,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as AdminSongsRegisterResponse;
      if (!res.ok) {
        setMsg(data.error || '登録に失敗しました。');
        return;
      }
      setSongId(data.songId ?? null);
      const extra = data.exportSkipped
        ? ' JSON 増分はスキップ（出力先未設定または失敗）。'
        : data.exportPath
          ? ' JSON を書き出しました。'
          : '';
      setMsg(`登録しました。${extra}`);
    } catch {
      setMsg('登録に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <AdminMenuBar />
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-xl font-semibold text-amber-100">洋楽 1 曲登録</h1>
        <p className="mt-2 text-sm text-gray-400">
          YouTube から 1 回で MusicAiChat の Supabase に書き込み、Music8 公開用 JSON を増分出力します。
          {fromYoutube ? ' （Chrome 拡張 YT to M7 から開きました）' : ''}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          WordPress 新規投稿（YT to WP）は並行期のみ。新規はこちらを正とします。
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm">
            YouTube ID / URL
            <input
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2"
              value={youtubeId}
              onChange={(e) => setYoutubeId(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            アーティスト
            <input
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            曲名
            <input
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            スタイル（Music8 ナビ）
            <select
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              {MUSIC8_NAV_STYLE_SLUGS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {previewUrl ? (
            <p className="text-xs">
              <a className="text-sky-400 hover:underline" href={previewUrl} target="_blank" rel="noreferrer">
                YouTube で開く
              </a>
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-black hover:bg-amber-500 disabled:opacity-50"
          >
            {busy ? '登録中…' : 'Supabase に登録'}
          </button>
        </form>

        {msg ? <p className="mt-4 text-sm text-amber-200">{msg}</p> : null}
        {songId ? (
          <p className="mt-2 text-sm">
            <Link className="text-sky-400 hover:underline" href={`/admin/songs/${songId}`}>
              曲詳細を開く
            </Link>
          </p>
        ) : null}
        <p className="mt-8 text-sm">
          <Link className="text-gray-400 hover:underline" href="/admin/songs">
            曲ダッシュボードへ戻る
          </Link>
        </p>
      </main>
    </div>
  );
}
