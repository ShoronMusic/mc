'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type RoomAccessLogSummaryRow = {
  date_jst: string;
  room_id: string;
  total: number;
  guests: number;
  members: number;
};

type ApiResponse = {
  error?: string;
  hint?: string;
  days?: number;
  rows?: RoomAccessLogSummaryRow[];
  scanned?: number;
  truncated?: boolean;
};

function detailHref(roomId: string, dateJst: string): string {
  const q = new URLSearchParams({ roomId, date: dateJst });
  return `/admin/room-access-log/detail?${q.toString()}`;
}

export default function AdminRoomAccessLogPage() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [rows, setRows] = useState<RoomAccessLogSummaryRow[]>([]);
  const [scanned, setScanned] = useState(0);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch(`/api/admin/room-access-log-summary?days=${days}`, {
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok) {
        setError(data?.error || '読み込みに失敗しました。');
        setHint(data?.hint ?? null);
        setRows([]);
        setScanned(0);
        setTruncated(false);
        return;
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setScanned(typeof data.scanned === 'number' ? data.scanned : 0);
      setTruncated(Boolean(data.truncated));
    } catch {
      setError('読み込みに失敗しました。');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, RoomAccessLogSummaryRow[]>();
    for (const r of rows) {
      const list = map.get(r.date_jst) ?? [];
      list.push(r);
      map.set(r.date_jst, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-5xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">部屋入室アクセス（日付・部屋別）</h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              集計期間
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="rounded border border-gray-600 bg-gray-800 px-2 py-1"
              >
                <option value={7}>過去7日</option>
                <option value={30}>過去30日</option>
                <option value={60}>過去60日</option>
                <option value={120}>過去120日</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => load()}
              className="rounded bg-gray-700 px-3 py-1 text-sm hover:bg-gray-600"
            >
              再読込
            </button>
          </div>
        </div>

        <section className="mb-6 rounded-lg border border-gray-700 bg-gray-900/50 p-4 text-sm text-gray-400">
          <p>
            <strong className="text-gray-300">STYLE_ADMIN_USER_IDS</strong> かつ{' '}
            <strong className="text-gray-300">SUPABASE_SERVICE_ROLE_KEY</strong> が必要です。
            部屋画面を開いたときにクライアントが <code className="rounded bg-gray-800 px-1">POST /api/room-access-log</code>{' '}
            を送り、<strong className="text-gray-300">日本時間の同一暦日</strong>では同一ログインユーザーまたは同一ゲスト
            visitorKey につき 1 行にまとめます（発言の有無は問いません）。
          </p>
          <p className="mt-2">
            DB 作成は <code className="rounded bg-gray-800 px-1">docs/supabase-room-access-log-table.md</code> を参照してください。
          </p>
        </section>

        {error && (
          <div className="mb-4 space-y-1 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-amber-200">
            <p>{error}</p>
            {hint && <p className="text-sm text-amber-300/90">{hint}</p>}
          </div>
        )}

        {loading ? (
          <p className="text-gray-400">読み込み中…</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-gray-500">
              走査行数: {scanned.toLocaleString()}
              {truncated && (
                <span className="ml-2 text-amber-400">
                  （上限に達したため、表示は一部のみの可能性があります）
                </span>
              )}
            </p>

            {grouped.length === 0 ? (
              <p className="text-gray-500">該当する記録がありません。</p>
            ) : (
              <div className="space-y-8">
                {grouped.map(([dateJst, list]) => (
                  <section key={dateJst}>
                    <h2 className="mb-2 border-b border-gray-700 pb-1 text-lg font-medium text-gray-200">
                      {dateJst}{' '}
                      <span className="text-sm font-normal text-gray-500">（JST）</span>
                    </h2>
                    <div className="overflow-x-auto rounded-lg border border-gray-700">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="border-b border-gray-700 bg-gray-800/80">
                          <tr>
                            <th className="px-3 py-2">部屋ID</th>
                            <th className="px-3 py-2 text-right">入室数</th>
                            <th className="px-3 py-2 text-right">うちゲスト</th>
                            <th className="px-3 py-2 text-right">うち会員</th>
                            <th className="px-3 py-2">明細</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((r) => (
                            <tr key={`${r.date_jst}-${r.room_id}`} className="border-b border-gray-800/80">
                              <td className="px-3 py-2 font-mono text-gray-200">{r.room_id}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                                {r.total.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-amber-200/90">
                                {r.guests.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-sky-200/90">
                                {r.members.toLocaleString()}
                              </td>
                              <td className="px-3 py-2">
                                <Link
                                  href={detailHref(r.room_id, r.date_jst)}
                                  className="text-sky-400 hover:underline"
                                >
                                  一覧
                                </Link>
                                <Link
                                  href={`/${encodeURIComponent(r.room_id)}`}
                                  className="ml-3 text-gray-400 hover:text-gray-300 hover:underline"
                                >
                                  部屋へ
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
