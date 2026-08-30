'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import {
  LIKED_SONG_AXIS_IDS,
  LIKED_SONG_AXIS_LABELS,
  LIKED_SONG_POLARITY_LABELS,
  type LikedSongAxisCandidate,
  type LikedSongAxisId,
  type LikedSongAxisLabResult,
} from '@/lib/liked-song-axis-types';
import { likedSongAxisHeatStyle } from '@/lib/liked-song-axis-score';

type SortKey = 'composite' | LikedSongAxisId;

type CellDetail = {
  candidate: LikedSongAxisCandidate;
  axis: LikedSongAxisId | 'composite';
};

const AXIS_COLUMNS: LikedSongAxisId[] = [
  'artist',
  'genre',
  'style',
  'era',
  'mood',
  'performance',
  'trend',
];

function scoreText(n: number | null | undefined): string {
  return n == null ? '—' : String(n);
}

function CatalogBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${
        ok
          ? 'border-emerald-700/70 bg-emerald-950/60 text-emerald-200'
          : 'border-amber-800/70 bg-amber-950/50 text-amber-200'
      }`}
    >
      {ok ? label : `${label}なし`}
    </span>
  );
}

export default function AdminLikedSongAxisLabPage() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LikedSongAxisLabResult | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('composite');
  const [detail, setDetail] = useState<CellDetail | null>(null);

  const run = useCallback(async (query: string) => {
    const key = query.trim();
    if (!key) {
      setError('検索キーを入力してください。');
      return;
    }
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      const res = await fetch('/api/admin/liked-song-axis-lab', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: key }),
      });
      const json = (await res.json().catch(() => ({}))) as LikedSongAxisLabResult & {
        error?: string;
      };
      if (!res.ok) {
        setData(null);
        setError(json.error || '選出に失敗しました。');
        return;
      }
      setData(json);
      setSortKey('composite');
    } catch {
      setData(null);
      setError('選出に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const list = [...data.candidates];
    list.sort((a, b) => {
      const av = sortKey === 'composite' ? a.composite : a.axes[sortKey]?.score ?? -1;
      const bv = sortKey === 'composite' ? b.composite : b.axes[sortKey]?.score ?? -1;
      return (bv ?? -1) - (av ?? -1);
    });
    return list;
  }, [data, sortKey]);

  const downloadJson = useCallback(() => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'liked-song-axis-lab.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [data]);

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-[1100px]">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">気に入り軸ラボ（試験）</h1>
          <Link href="/admin" className="text-sm text-sky-400 hover:underline">
            ← ダッシュボード
          </Link>
        </div>

        <section className="mb-6 rounded-lg border border-gray-700 bg-gray-900/50 p-4 text-sm text-gray-400">
          <p className="leading-relaxed">
            種曲を指定すると Gemini が「効いていそうな軸」と候補曲を選出し、各要素の類似 0–100
            を行列で出します。部屋チャットには出ません。欠損は 0 ではなく{' '}
            <strong className="text-gray-300">—</strong>（測れない）です。
          </p>
        </section>

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <label className="min-w-[260px] flex-1 text-xs text-gray-400">
            種曲（YouTube URL / ID、またはアーティスト - タイトル）
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) void run(q);
              }}
              placeholder="例: https://www.youtube.com/watch?v=… または Duran Duran - Hungry Like the Wolf"
              className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-white"
            />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void run(q)}
            className="rounded bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-40"
          >
            {loading ? 'AI 選出中…' : 'AI で選出'}
          </button>
        </div>

        {error ? <p className="mb-4 text-sm text-red-300">{error}</p> : null}

        {data ? (
          <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-white">{data.seed.displayLabel}</p>
                <p className="mt-1 text-sm text-gray-400">
                  {data.seed.year ?? '年不明'}
                  {data.seed.style ? ` · ${data.seed.style}` : ''}
                  {data.seed.genres.length > 0 ? ` · ${data.seed.genres.join('、')}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <CatalogBadge ok={data.seed.inMcDb} label="mc DB" />
                  <CatalogBadge ok={data.seed.inMusic8} label="Music8" />
                  {data.model ? (
                    <span className="text-[10px] text-gray-500">model: {data.model}</span>
                  ) : null}
                </div>
                {data.seed.watchUrl ? (
                  <a
                    href={data.seed.watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm text-sky-400 hover:underline"
                  >
                    {data.seed.watchUrl}
                  </a>
                ) : null}
              </div>
              <button
                type="button"
                onClick={downloadJson}
                className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
              >
                JSON 保存
              </button>
            </div>

            {data.salientAxes.length > 0 ? (
              <div className="mb-4">
                <p className="mb-2 text-xs text-gray-500">AI が挙げた「効いていそうな軸」</p>
                <ul className="flex flex-wrap gap-2">
                  {data.salientAxes.map((ax) => (
                    <li
                      key={`${ax.id}-${ax.label}`}
                      className="rounded-full border border-violet-800/70 bg-violet-950/40 px-3 py-1 text-xs text-violet-100"
                      title={ax.why}
                    >
                      {LIKED_SONG_AXIS_LABELS[ax.id]}: {ax.label}
                      {ax.why ? ` — ${ax.why}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {data.warnings.length > 0 ? (
              <ul className="mb-4 list-inside list-disc rounded border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-100/95">
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}

            <div className="mb-3 overflow-x-auto rounded-lg border border-gray-800">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-gray-900 text-gray-400">
                    <th className="sticky left-0 z-10 bg-gray-900 px-2 py-2 font-medium">候補</th>
                    <th className="px-2 py-2 font-medium">分岐</th>
                    <th className="px-1 py-2">
                      <button
                        type="button"
                        className={`px-1 ${sortKey === 'composite' ? 'text-white' : 'hover:text-white'}`}
                        onClick={() => setSortKey('composite')}
                      >
                        総合
                      </button>
                    </th>
                    {AXIS_COLUMNS.map((id) => (
                      <th key={id} className="px-1 py-2">
                        <button
                          type="button"
                          className={`px-1 ${sortKey === id ? 'text-white' : 'hover:text-white'}`}
                          onClick={() => setSortKey(id)}
                        >
                          {LIKED_SONG_AXIS_LABELS[id]}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={`${c.artist}-${c.title}`} className="border-t border-gray-800">
                      <td className="sticky left-0 z-10 max-w-[220px] bg-gray-950 px-2 py-2">
                        <button
                          type="button"
                          className="text-left text-gray-100 hover:underline"
                          onClick={() => {
                            const next = c.catalog.watchUrl || `${c.artist} - ${c.title}`;
                            setQ(c.catalog.videoId || next);
                          }}
                          title="この曲を種曲キーに入れる（再実行はボタン）"
                        >
                          <span className="font-medium">{c.title}</span>
                          <span className="mt-0.5 block text-[11px] text-gray-400">{c.artist}</span>
                        </button>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <CatalogBadge ok={c.catalog.inMcDb} label="DB" />
                          <CatalogBadge ok={c.catalog.inMusic8} label="M8" />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-[11px] text-gray-300">
                        <div>
                          {LIKED_SONG_AXIS_LABELS[c.axis]} ·{' '}
                          {c.reasonLabel || LIKED_SONG_POLARITY_LABELS[c.polarity]}
                        </div>
                        {c.reason ? (
                          <p className="mt-1 max-w-[180px] text-[10px] leading-snug text-gray-500">
                            {c.reason}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-1 py-1">
                        <button
                          type="button"
                          className="w-full rounded px-1.5 py-2 text-center font-semibold"
                          style={likedSongAxisHeatStyle(c.composite)}
                          onClick={() => setDetail({ candidate: c, axis: 'composite' })}
                        >
                          {scoreText(c.composite)}
                        </button>
                      </td>
                      {AXIS_COLUMNS.map((id) => {
                        const cell = c.axes[id];
                        return (
                          <td key={id} className="px-1 py-1">
                            <button
                              type="button"
                              className="w-full rounded px-1.5 py-2 text-center"
                              style={likedSongAxisHeatStyle(cell?.score ?? null)}
                              onClick={() => setDetail({ candidate: c, axis: id })}
                              title={cell?.label}
                            >
                              {scoreText(cell?.score ?? null)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mb-4 text-[11px] text-gray-500">
              列見出しでソート。セルをクリックすると根拠。曲名をクリックすると種曲キーに入ります（「AI で選出」で再計算）。
            </p>

            {detail ? (
              <section className="mb-8 rounded-lg border border-gray-700 bg-gray-900/60 p-4 text-sm">
                <p className="font-medium text-white">
                  {detail.candidate.artist} — {detail.candidate.title}
                </p>
                {detail.axis === 'composite' ? (
                  <p className="mt-2 text-gray-300">
                    総合 {scoreText(detail.candidate.composite)}（欠損軸は分母から除外）
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-gray-300">
                      {LIKED_SONG_AXIS_LABELS[detail.axis]}:{' '}
                      {scoreText(detail.candidate.axes[detail.axis]?.score ?? null)}
                      {detail.candidate.axes[detail.axis]
                        ? `（${detail.candidate.axes[detail.axis]?.source === 'catalog' ? 'カタログ' : 'AI'}）`
                        : ''}
                    </p>
                    <p className="mt-1 text-gray-400">
                      {detail.candidate.axes[detail.axis]?.label ?? '測れない（—）'}
                    </p>
                    {detail.candidate.axes[detail.axis]?.raw ? (
                      <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-2 text-[11px] text-gray-400">
                        {JSON.stringify(detail.candidate.axes[detail.axis]?.raw, null, 2)}
                      </pre>
                    ) : null}
                  </>
                )}
                <p className="mt-2 text-gray-400">{detail.candidate.reason}</p>
                {detail.candidate.catalog.watchUrl ? (
                  <a
                    href={detail.candidate.catalog.watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sky-400 hover:underline"
                  >
                    YouTube
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">
                    検索: {detail.candidate.youtubeSearchQuery}
                  </p>
                )}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
