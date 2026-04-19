'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type RoomAccessLogDetailRow = {
  accessed_at: string;
  display_name: string;
  is_guest: boolean;
  user_id: string | null;
};

type ApiResponse = {
  error?: string;
  hint?: string;
  roomId?: string;
  date_jst?: string;
  rows?: RoomAccessLogDetailRow[];
  truncated?: boolean;
  maxRows?: number;
};

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function AdminRoomAccessLogDetailInner() {
  const searchParams = useSearchParams();
  const roomId = (searchParams.get('roomId') ?? '').trim();
  const dateJst = (searchParams.get('date') ?? '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [rows, setRows] = useState<RoomAccessLogDetailRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [maxRows, setMaxRows] = useState(8000);

  const load = useCallback(async () => {
    if (!roomId || !dateJst) {
      setLoading(false);
      setError('roomId と date（YYYY-MM-DD）をクエリで指定してください。');
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const q = new URLSearchParams({ roomId, date: dateJst });
      const res = await fetch(`/api/admin/room-access-log-detail?${q.toString()}`, {
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok) {
        setError(data?.error || '読み込みに失敗しました。');
        setHint(data?.hint ?? null);
        setRows([]);
        setTruncated(false);
        return;
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTruncated(Boolean(data.truncated));
      setMaxRows(typeof data.maxRows === 'number' ? data.maxRows : 8000);
    } catch {
      setError('読み込みに失敗しました。');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [roomId, dateJst]);

  useEffect(() => {
    void load();
  }, [load]);

  const backHref = useMemo(() => '/admin/room-access-log', []);

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-5xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">入室アクセス明細</h1>
          <Link href={backHref} className="text-sm text-sky-400 hover:underline">
            ← 集計へ
          </Link>
        </div>

        <p className="mb-4 text-sm text-gray-400">
          部屋 <span className="font-mono text-gray-200">{roomId || '—'}</span> ／ 日付（JST）{' '}
          <span className="font-mono text-gray-200">{dateJst || '—'}</span>
        </p>

        {error && (
          <div className="mb-4 space-y-1 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-amber-200">
            <p>{error}</p>
            {hint && <p className="text-sm text-amber-300/90">{hint}</p>}
          </div>
        )}

        {loading ? (
          <p className="text-gray-400">読み込み中…</p>
        ) : rows.length === 0 && !error ? (
          <p className="text-gray-500">該当する行がありません。</p>
        ) : (
          <>
            {truncated && (
              <p className="mb-2 text-sm text-amber-400">
                表示は先頭 {maxRows.toLocaleString()} 件までです。
              </p>
            )}
            <div className="overflow-x-auto rounded-lg border border-gray-700">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-gray-700 bg-gray-800/80">
                  <tr>
                    <th className="px-3 py-2">時刻（JST）</th>
                    <th className="px-3 py-2">表示名</th>
                    <th className="px-3 py-2">種別</th>
                    <th className="px-3 py-2">user_id</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.accessed_at}-${i}`} className="border-b border-gray-800/80">
                      <td className="px-3 py-2 tabular-nums text-gray-300">{formatTime(r.accessed_at)}</td>
                      <td className="px-3 py-2 text-gray-200">{r.display_name}</td>
                      <td className="px-3 py-2">
                        {r.is_guest ? (
                          <span className="text-amber-200/90">ゲスト</span>
                        ) : (
                          <span className="text-sky-200/90">会員</span>
                        )}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2 font-mono text-xs text-gray-500">
                        {r.user_id ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function AdminRoomAccessLogDetailPage() {
  return (
    <Suspense fallback={<p className="p-4 text-gray-400">読み込み中…</p>}>
      <AdminRoomAccessLogDetailInner />
    </Suspense>
  );
}
