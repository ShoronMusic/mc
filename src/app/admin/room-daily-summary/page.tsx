'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type SummaryItem = {
  id: string;
  room_id: string;
  date_jst: string;
  session_part?: 'part1' | 'part2';
  active_from_at: string;
  active_to_at: string;
  participants: string[] | null;
  participant_song_counts: Array<{ displayName: string; count: number }> | null;
  era_distribution: Array<{ era: string; count: number }> | null;
  style_distribution: Array<{ style: string; count: number }> | null;
  gemini_usage: {
    calls?: number;
    promptTokens?: number;
    outputTokens?: number;
    costJpy?: number;
    costUsd?: number;
    popularArtists?: Array<{ artist?: string; count?: number }>;
  } | null;
  summary_text: string;
  created_at: string;
};

type PlaylistItem = {
  played_at: string;
  display_name: string;
  video_id: string;
  title: string | null;
  artist_name: string | null;
  style: string | null;
  era: string | null;
};

function todayJstYmd(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP');
  } catch {
    return iso;
  }
}

type ApiResponse = {
  error?: string;
  hint?: string;
  items?: SummaryItem[];
};

export default function AdminRoomDailySummaryPage() {
  const [roomId, setRoomId] = useState('01');
  const [dateJst, setDateJst] = useState(todayJstYmd());
  const [sessionPart, setSessionPart] = useState<'part1' | 'part2'>('part2');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [playlistRoomId, setPlaylistRoomId] = useState('');
  const [playlistDateJst, setPlaylistDateJst] = useState('');
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const q = new URLSearchParams({
        limit: '100',
        ...(roomId.trim() ? { roomId: roomId.trim() } : {}),
      });
      const res = await fetch(`/api/admin/room-daily-summary?${q.toString()}`, { credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok) {
        setError(data.error ?? '読み込みに失敗しました。');
        setHint(data.hint ?? null);
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
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
      const res = await fetch('/api/admin/room-daily-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomId: rid, dateJst, sessionPart }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? '生成に失敗しました。');
        setHint(data.hint ?? null);
        return;
      }
      await load();
    } catch {
      setError('生成に失敗しました。');
    } finally {
      setSaving(false);
    }
  }, [roomId, dateJst, sessionPart, load]);

  const filtered = useMemo(
    () => items.filter((it) => !dateJst || it.date_jst === dateJst),
    [items, dateJst],
  );

  const playlistTextHref =
    playlistRoomId && playlistDateJst
      ? `/api/admin/room-daily-playlist?roomId=${encodeURIComponent(playlistRoomId)}&dateJst=${encodeURIComponent(
          playlistDateJst,
        )}&format=text&download=1`
      : '#';
  const playlistCsvHref =
    playlistRoomId && playlistDateJst
      ? `/api/admin/room-daily-playlist?roomId=${encodeURIComponent(playlistRoomId)}&dateJst=${encodeURIComponent(
          playlistDateJst,
        )}&format=csv&download=1`
      : '#';

  const openPlaylistModal = useCallback(async (targetRoomId: string, targetDateJst: string) => {
    setPlaylistModalOpen(true);
    setPlaylistLoading(true);
    setPlaylistError(null);
    setPlaylistItems([]);
    setPlaylistRoomId(targetRoomId);
    setPlaylistDateJst(targetDateJst);
    try {
      const q = new URLSearchParams({
        roomId: targetRoomId,
        dateJst: targetDateJst,
      });
      const res = await fetch(`/api/admin/room-daily-playlist?${q.toString()}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlaylistError(data?.error ?? '視聴リストの読み込みに失敗しました。');
        return;
      }
      setPlaylistItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setPlaylistError('視聴リストの読み込みに失敗しました。');
    } finally {
      setPlaylistLoading(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-6xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">部屋日次チャットサマリー</h1>
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
              開催枠
              <select
                value={sessionPart}
                onChange={(e) => setSessionPart(e.target.value === 'part1' ? 'part1' : 'part2')}
                className="ml-2 rounded border border-gray-600 bg-gray-800 px-2 py-1"
              >
                <option value="part1">第1部（06:00-18:00）</option>
                <option value="part2">第2部（18:00-翌06:00）</option>
              </select>
            </label>
            <label className="text-sm">
              日付
              <input
                type="date"
                value={dateJst}
                onChange={(e) => setDateJst(e.target.value)}
                className="ml-2 rounded border border-gray-600 bg-gray-800 px-2 py-1"
              />
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
          日付単位・部屋単位で、利用時間、参加者、参加者ごとの選曲数、時代/スタイル分布、Gemini使用量、内容サマリーを保存して確認します。
          <br />
          集計ウィンドウは <span className="font-semibold text-amber-200">第1部 06:00〜18:00 / 第2部 18:00〜翌06:00（JST）</span> の2枠です。
        </section>

        {error && (
          <div className="mb-4 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-amber-200">
            <p>{error}</p>
            {hint && <p className="text-sm text-amber-300/90">{hint}</p>}
          </div>
        )}

        {loading ? (
          <p className="text-gray-400">読み込み中…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500">保存済みサマリーはありません。</p>
        ) : (
          <div className="space-y-4">
            {filtered.map((it) => (
              <section key={it.id} className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-medium text-gray-200">
                    room {it.room_id} / {it.date_jst} / {it.session_part === 'part1' ? '第1部' : '第2部'}
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void openPlaylistModal(it.room_id, it.date_jst)}
                      className="rounded border border-sky-700 bg-sky-900/20 px-2 py-1 text-xs text-sky-200 hover:bg-sky-900/40"
                    >
                      視聴リスト
                    </button>
                    <span className="text-xs text-gray-500">作成: {fmt(it.created_at)}</span>
                  </div>
                </div>
                <div className="mb-2 text-sm text-gray-300">
                  利用時間（開催枠: {it.session_part === 'part1' ? '06:00〜18:00' : '18:00〜翌06:00'}）: {fmt(it.active_from_at)} 〜 {fmt(it.active_to_at)}
                </div>
                <div className="mb-2 text-sm text-gray-300">参加者: {(it.participants ?? []).join('、') || '—'}</div>
                <div className="mb-2 text-sm text-gray-300">
                  選曲数: {(it.participant_song_counts ?? []).map((v) => `${v.displayName}(${v.count})`).join(' / ') || '—'}
                </div>
                <div className="mb-2 text-sm text-gray-300">
                  時代分布: {(it.era_distribution ?? []).map((v) => `${v.era}:${v.count}`).join(' / ') || '—'}
                </div>
                <div className="mb-2 text-sm text-gray-300">
                  スタイル分布: {(it.style_distribution ?? []).map((v) => `${v.style}:${v.count}`).join(' / ') || '—'}
                </div>
                <div className="mb-2 text-sm text-gray-300">
                  人気アーティスト:{' '}
                  {(it.gemini_usage?.popularArtists ?? [])
                    .map((v) => `${v.artist ?? '—'}:${v.count ?? 0}`)
                    .join(' / ') || '—'}
                </div>
                <div className="mb-3 text-sm text-gray-300">
                  Gemini使用量: {it.gemini_usage?.calls ?? 0}回 / 入力 {(it.gemini_usage?.promptTokens ?? 0).toLocaleString()} / 出力{' '}
                  {(it.gemini_usage?.outputTokens ?? 0).toLocaleString()} / 概算 ¥{(it.gemini_usage?.costJpy ?? 0).toFixed(2)}
                </div>
                <p className="text-sm text-gray-100">{it.summary_text}</p>
              </section>
            ))}
          </div>
        )}

        {playlistModalOpen && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="日次視聴リスト"
            onClick={() => setPlaylistModalOpen(false)}
          >
            <div
              className="max-h-[85vh] w-full max-w-6xl overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
                <h3 className="text-sm font-medium text-gray-200">
                  視聴リスト / room {playlistRoomId} / {playlistDateJst}
                </h3>
                <div className="flex items-center gap-2">
                  <a
                    href={playlistTextHref}
                    className="rounded border border-emerald-700 bg-emerald-900/20 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/40"
                  >
                    TEXT
                  </a>
                  <a
                    href={playlistCsvHref}
                    className="rounded border border-amber-700 bg-amber-900/20 px-2 py-1 text-xs text-amber-200 hover:bg-amber-900/40"
                  >
                    CSV
                  </a>
                  <button
                    type="button"
                    onClick={() => setPlaylistModalOpen(false)}
                    className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
                  >
                    閉じる
                  </button>
                </div>
              </div>
              <div className="max-h-[72vh] overflow-auto p-4">
                {playlistLoading ? (
                  <p className="text-gray-400">読み込み中…</p>
                ) : playlistError ? (
                  <p className="text-amber-300">{playlistError}</p>
                ) : playlistItems.length === 0 ? (
                  <p className="text-gray-500">該当する視聴リストはありません。</p>
                ) : (
                  <div className="overflow-x-auto rounded border border-gray-700">
                    <table className="w-full min-w-[980px] text-left text-sm">
                      <thead className="border-b border-gray-700 bg-gray-800/80">
                        <tr>
                          <th className="px-3 py-2">参加者</th>
                          <th className="px-3 py-2">時間</th>
                          <th className="px-3 py-2">年代</th>
                          <th className="px-3 py-2">スタイル</th>
                          <th className="px-3 py-2">アーティスト - タイトル</th>
                          <th className="px-3 py-2">リンク</th>
                        </tr>
                      </thead>
                      <tbody>
                        {playlistItems.map((r, idx) => (
                          <tr key={`${r.video_id}-${r.played_at}-${idx}`} className="border-b border-gray-800/80">
                            <td className="px-3 py-2 text-gray-200">{r.display_name}</td>
                            <td className="px-3 py-2 text-gray-400">{fmt(r.played_at)}</td>
                            <td className="px-3 py-2 text-amber-300">{r.era ?? 'Other'}</td>
                            <td className="px-3 py-2 text-sky-300">{r.style ?? 'Other'}</td>
                            <td className="px-3 py-2 text-gray-200">{`${r.artist_name ?? '—'} - ${r.title ?? r.video_id}`}</td>
                            <td className="px-3 py-2">
                              <a
                                href={`https://www.youtube.com/watch?v=${encodeURIComponent(r.video_id)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-red-300 hover:underline"
                              >
                                YT
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

