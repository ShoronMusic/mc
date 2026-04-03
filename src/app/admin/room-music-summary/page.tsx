'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type SummaryItem = {
  id: string;
  room_id: string;
  window_hours: number;
  window_start_at: string;
  window_end_at: string;
  total_plays: number;
  total_messages: number;
  top_styles: string[] | null;
  top_eras: string[] | null;
  top_artists: string[] | null;
  top_tracks:
    | Array<{ artist?: string; title?: string; plays?: number; mention?: number; score?: number }>
    | null;
  summary_text: string;
  created_by_user_id: string | null;
  created_at: string;
};

type ApiResponse = {
  error?: string;
  hint?: string;
  items?: SummaryItem[];
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP');
  } catch {
    return iso;
  }
}

export default function AdminRoomMusicSummaryPage() {
  const [roomId, setRoomId] = useState('01');
  const [hours, setHours] = useState<1 | 2>(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [items, setItems] = useState<SummaryItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const q = new URLSearchParams({
        limit: '100',
        ...(roomId.trim() ? { roomId: roomId.trim() } : {}),
      });
      const res = await fetch(`/api/admin/room-music-summary?${q.toString()}`, {
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok) {
        setError(data?.error ?? '読み込みに失敗しました。');
        setHint(data?.hint ?? null);
        setItems([]);
        return;
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setError('読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onGenerate = useCallback(async () => {
    const rid = roomId.trim();
    if (!rid) {
      setError('roomId を入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch('/api/admin/room-music-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomId: rid, hours }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? 'サマリー生成に失敗しました。');
        setHint(data?.hint ?? null);
        return;
      }
      await load();
    } catch {
      setError('サマリー生成に失敗しました。');
    } finally {
      setSaving(false);
    }
  }, [roomId, hours, load]);

  const latest = useMemo(() => (items.length > 0 ? items[0] : null), [items]);

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-6xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">部屋音楽サマリー</h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm">
              roomId
              <input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="ml-2 w-20 rounded border border-gray-600 bg-gray-800 px-2 py-1"
              />
            </label>
            <label className="text-sm">
              期間
              <select
                value={hours}
                onChange={(e) => setHours(Number(e.target.value) === 1 ? 1 : 2)}
                className="ml-2 rounded border border-gray-600 bg-gray-800 px-2 py-1"
              >
                <option value={1}>直近1時間</option>
                <option value={2}>直近2時間</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void onGenerate()}
              disabled={saving}
              className="rounded bg-amber-600 px-3 py-1 text-sm text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {saving ? '生成中…' : '生成して保存'}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded bg-gray-700 px-3 py-1 text-sm hover:bg-gray-600"
            >
              再読込
            </button>
          </div>
        </div>

        <section className="mb-4 rounded-lg border border-gray-700 bg-gray-900/50 p-4 text-sm text-gray-300">
          直近 1〜2 時間の再生履歴と会話ログから、スタイル・年代・人気曲（再生+言及）を集計し、サマリーを
          DB に保存します。まずは管理画面での運用確認用です。
        </section>

        {error && (
          <div className="mb-4 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-amber-200">
            <p>{error}</p>
            {hint && <p className="text-sm text-amber-300/90">{hint}</p>}
          </div>
        )}

        {latest && (
          <section className="mb-6 rounded-lg border border-gray-700 bg-gray-900/50 p-4">
            <h2 className="mb-2 text-sm font-medium text-gray-300">最新サマリー</h2>
            <p className="mb-3 text-gray-100">{latest.summary_text}</p>
            <div className="grid gap-2 text-xs text-gray-400 sm:grid-cols-4">
              <div>再生数: {latest.total_plays}</div>
              <div>会話数: {latest.total_messages}</div>
              <div>スタイル: {(latest.top_styles ?? []).join(' / ') || '—'}</div>
              <div>年代: {(latest.top_eras ?? []).join(' / ') || '—'}</div>
            </div>
          </section>
        )}

        {loading ? (
          <p className="text-gray-400">読み込み中…</p>
        ) : items.length === 0 ? (
          <p className="text-gray-500">保存済みサマリーはありません。</p>
        ) : (
          <section className="overflow-x-auto rounded-lg border border-gray-700">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-gray-700 bg-gray-800/80">
                <tr>
                  <th className="px-3 py-2">作成日時</th>
                  <th className="px-3 py-2">room</th>
                  <th className="px-3 py-2">期間</th>
                  <th className="px-3 py-2 text-right">再生</th>
                  <th className="px-3 py-2 text-right">会話</th>
                  <th className="px-3 py-2">人気アーティスト</th>
                  <th className="px-3 py-2">サマリー</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-gray-800/80 align-top">
                    <td className="px-3 py-2 text-gray-400">{fmtTime(it.created_at)}</td>
                    <td className="px-3 py-2 font-mono">{it.room_id}</td>
                    <td className="px-3 py-2">直近{it.window_hours}時間</td>
                    <td className="px-3 py-2 text-right">{it.total_plays}</td>
                    <td className="px-3 py-2 text-right">{it.total_messages}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-gray-300" title={(it.top_artists ?? []).join('、')}>
                      {(it.top_artists ?? []).join('、') || '—'}
                    </td>
                    <td className="max-w-[520px] px-3 py-2 text-gray-200">{it.summary_text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}

