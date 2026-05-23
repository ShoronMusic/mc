'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import type {
  SongsNewlyRegisteredDay,
  SongsNewlyRegisteredItem,
} from '@/app/api/admin/songs-newly-registered/route';

function defaultToInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfLocalDayToIso(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function fmtCreatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  } catch {
    return iso;
  }
}

export default function AdminSongsNewlyRegisteredPage() {
  const [days, setDays] = useState(14);
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState(defaultToInputValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    fromIso: string;
    toIso: string;
    truncated: boolean;
    totalSongs: number;
  } | null>(null);
  const [dayGroups, setDayGroups] = useState<SongsNewlyRegisteredDay[]>([]);

  const totalItems = useMemo(
    () => dayGroups.reduce((acc, d) => acc + d.items.length, 0),
    [dayGroups],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      const fromIso = startOfLocalDayToIso(fromInput);
      const toIso = startOfLocalDayToIso(toInput);
      if (fromIso) q.set('from', fromIso);
      if (toIso) q.set('to', toIso);
      if (!fromIso && !toIso) q.set('days', String(days));

      const res = await fetch(`/api/admin/songs-newly-registered?${q.toString()}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : '取得に失敗しました。');
        setDayGroups([]);
        setMeta(null);
        return;
      }
      setMeta({
        fromIso: data.fromIso,
        toIso: data.toIso,
        truncated: Boolean(data.truncated),
        totalSongs: typeof data.total_songs === 'number' ? data.total_songs : 0,
      });
      setDayGroups(Array.isArray(data.days) ? data.days : []);
    } catch {
      setError('取得に失敗しました。');
      setDayGroups([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [days, fromInput, toInput]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-gray-950 p-4 text-gray-100 sm:p-6">
      <AdminMenuBar />
      <h1 className="text-xl font-semibold text-white sm:text-2xl">新規登録曲（日別）</h1>
      <p className="mt-2 text-sm text-gray-400">
        選曲時の <code className="rounded bg-gray-800 px-1">upsertSongAndVideo</code> で{' '}
        <code className="rounded bg-gray-800 px-1">songs</code> テーブルに新規 insert された曲を、
        <code className="rounded bg-gray-800 px-1">created_at</code> を基準に{' '}
        <strong className="text-gray-200">JST の日付</strong>ごとに表示します。既存曲の再選曲（再利用）や
        Music8 一括 import は含みません。
      </p>

      <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
        <h2 className="text-sm font-semibold text-amber-200">期間</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-col text-xs text-gray-400">
            from（任意・ローカル日時 → ISO）
            <input
              type="datetime-local"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              className="mt-1 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="flex flex-col text-xs text-gray-400">
            to（任意・既定は現在）
            <input
              type="datetime-local"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              className="mt-1 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="flex flex-col text-xs text-gray-400">
            from/to 未指定時の幅（日）
            <input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Number.parseInt(e.target.value, 10) || 14)}
              disabled={Boolean(fromInput.trim() || toInput.trim())}
              className="mt-1 w-24 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white disabled:opacity-40"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-amber-500 disabled:opacity-50"
          >
            {loading ? '取得中…' : '再取得'}
          </button>
        </div>
        {meta ? (
          <p className="mt-3 text-xs text-gray-500">
            対象 {meta.totalSongs} 曲
            {meta.truncated ? '（上限 5000 件で打ち切り）' : ''} · UTC {meta.fromIso.slice(0, 19)} 〜{' '}
            {meta.toIso.slice(0, 19)} · 表示 {totalItems} 曲 / {dayGroups.length} 日
          </p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      </section>

      <section className="mt-8 space-y-10">
        {dayGroups.map((group) => (
          <div key={group.date}>
            <h2 className="border-b border-gray-800 pb-2 text-lg font-medium text-white">
              {group.date}{' '}
              <span className="text-sm font-normal text-gray-500">（JST）</span>
              <span className="ml-2 text-sm text-gray-400">{group.items.length} 件</span>
            </h2>
            <ul className="mt-3 divide-y divide-gray-800 rounded-lg border border-gray-800 bg-gray-900/40">
              {group.items.map((item: SongsNewlyRegisteredItem) => (
                <li
                  key={item.song_id}
                  className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {item.display_title ?? '（display_title なし）'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.main_artist ?? '—'} · {item.song_title ?? '—'}
                      {item.style ? (
                        <>
                          {' '}
                          · <span className="text-gray-400">{item.style}</span>
                        </>
                      ) : null}
                      {item.has_music8 ? (
                        <span className="ml-2 text-emerald-400/90">Music8 連携済</span>
                      ) : (
                        <span className="ml-2 text-amber-300/80">Music8 未連携</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      部屋:{' '}
                      {item.room_display_title ? (
                        <>
                          <span className="text-gray-200">{item.room_display_title}</span>
                          {item.room_id ? (
                            <span className="ml-1 font-mono text-gray-500">({item.room_id})</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-gray-500">—（視聴履歴なし）</span>
                      )}
                      {' · '}
                      選曲者:{' '}
                      <span className="text-gray-200">{item.selector_display_name ?? '—'}</span>
                    </p>
                    <p className="mt-1 font-mono text-xs text-gray-500">
                      song_id=
                      <Link href={item.admin_song_href} className="text-amber-200/90 hover:text-amber-100">
                        {item.song_id}
                      </Link>
                      {item.video_ids.length > 0 ? (
                        <>
                          {' '}
                          · video_id={item.video_ids.join(', ')}
                        </>
                      ) : (
                        <span className="text-amber-300/80"> · song_videos 未登録</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      登録 {fmtCreatedAt(item.created_at)} · play_count {item.play_count}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                    {item.video_ids[0] ? (
                      <a
                        href={`https://www.youtube.com/watch?v=${encodeURIComponent(item.video_ids[0])}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-sky-400 hover:text-sky-300"
                      >
                        YouTube を開く
                      </a>
                    ) : null}
                    <Link href={item.admin_song_href} className="text-sm text-amber-200/90 hover:text-amber-100">
                      曲ダッシュボード
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {!loading && dayGroups.length === 0 && !error && meta ? (
        <p className="mt-8 text-sm text-gray-500">この期間に新規登録された曲はありません。</p>
      ) : null}
    </main>
  );
}
