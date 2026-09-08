'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminRegisteredSongsMonthlyDashboard } from '@/lib/admin-registered-songs-monthly';
import {
  ADMIN_STYLE_MONTHLY_COLORS,
  ADMIN_STYLE_MONTHLY_LABELS,
  buildAdminRegisteredSongsMonthlyDashboard,
  currentJstYear,
  monthlyCountClass,
} from '@/lib/admin-registered-songs-monthly';
import { MUSIC8_NAV_STYLE_SLUGS } from '@/lib/music8-catalog-slugs';

type Scope = 'all' | 'western' | 'domestic';

function fmtCount(n: number): string {
  return n.toLocaleString('ja-JP');
}

function countCellClass(kind: ReturnType<typeof monthlyCountClass>, isTotalRow = false): string {
  if (kind === 'zero') return isTotalRow ? 'text-slate-500 bg-slate-900/40' : 'text-slate-600 bg-transparent';
  if (kind === 'high') return isTotalRow ? 'bg-slate-500 text-white font-bold' : 'font-bold';
  if (kind === 'mid') return isTotalRow ? 'bg-slate-700 text-slate-100 font-semibold' : 'font-semibold';
  return isTotalRow ? 'bg-slate-800 text-slate-200' : 'font-medium';
}

export function AdminRegisteredSongsMonthlyPanel({ scope }: { scope: Scope }) {
  const [year, setYear] = useState(() => currentJstYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dash, setDash] = useState<AdminRegisteredSongsMonthlyDashboard>(() =>
    buildAdminRegisteredSongsMonthlyDashboard({ year: currentJstYear(), songs: [] }),
  );
  const thisYear = currentJstYear();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('year', String(year));
      params.set('scope', scope);
      const res = await fetch(`/api/admin/songs-registered-monthly?${params.toString()}`, {
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as AdminRegisteredSongsMonthlyDashboard & {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || '月次集計の取得に失敗しました。');
        return;
      }
      setDash(data);
    } catch {
      setError('月次集計の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [year, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const styles = dash.styles;
  const monthTotals = dash.monthTotals;
  const maxStyleCell = dash.maxStyleCell;
  const maxMonthTotal = dash.maxMonthTotal;
  const total = dash.total;

  return (
    <section
      className="mb-6 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60"
      aria-labelledby="registered-songs-monthly-title"
    >
      <div className="border-b border-gray-800 px-4 py-4 sm:px-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="registered-songs-monthly-title" className="text-base font-semibold text-amber-100">
              ダッシュボード スタイル別月間登録曲数
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              <span className="font-medium text-gray-300">{year}年</span>
              <span className="mx-2 text-gray-700" aria-hidden>
                |
              </span>
              合計 <strong className="text-lg font-bold text-gray-100">{loading ? '…' : fmtCount(total)}</strong> 曲
            </p>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="rounded border border-gray-700 px-2 py-1 text-gray-300 hover:bg-gray-800"
            >
              ← {year - 1}
            </button>
            <button
              type="button"
              disabled={year >= thisYear}
              onClick={() => setYear((y) => Math.min(thisYear, y + 1))}
              className="rounded border border-gray-700 px-2 py-1 text-gray-300 hover:bg-gray-800 disabled:opacity-40"
            >
              {year + 1} →
            </button>
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-400" aria-label="スタイルカラー">
          {MUSIC8_NAV_STYLE_SLUGS.map((slug) => (
            <li key={slug} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full border border-black/20"
                style={{ backgroundColor: ADMIN_STYLE_MONTHLY_COLORS[slug] }}
              />
              {ADMIN_STYLE_MONTHLY_LABELS[slug]}
            </li>
          ))}
        </ul>
      </div>

      {error ? (
        <p className="px-4 py-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto px-3 py-3 sm:px-4 sm:py-4" role="region" aria-label="スタイル別月間登録曲数テーブル">
        <table className="min-w-[920px] w-full border-collapse text-sm tabular-nums">
          <caption className="sr-only">{year}年のスタイル別・月別登録曲数</caption>
          <thead>
            <tr className="bg-gray-800/80 text-gray-300">
              <th scope="col" className="border border-gray-700 px-3 py-2.5 text-left font-semibold">
                スタイル
              </th>
              {Array.from({ length: 12 }, (_, i) => (
                <th key={i} scope="col" className="border border-gray-700 px-2 py-2.5 text-center font-semibold">
                  {i + 1}月
                </th>
              ))}
              <th scope="col" className="border border-gray-700 px-3 py-2.5 text-center font-semibold">
                合計
              </th>
            </tr>
          </thead>
          <tbody>
            {styles.map((row) => {
              const [r, g, b] = row.rgb;
              return (
                <tr key={row.slug}>
                  <th
                    scope="row"
                    className="border border-gray-700 bg-gray-950 px-3 py-2.5 text-left font-bold whitespace-nowrap"
                    style={{ borderLeft: `6px solid ${row.color}` }}
                  >
                    <span
                      className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                      style={{ backgroundColor: row.color }}
                      aria-hidden
                    />
                    <span style={{ color: row.color }}>{row.label}</span>
                  </th>
                  {row.months.map((count, i) => {
                    const kind = monthlyCountClass(count, maxStyleCell);
                    const bg =
                      kind === 'zero'
                        ? undefined
                        : kind === 'high'
                          ? row.color
                          : kind === 'mid'
                            ? `rgba(${r}, ${g}, ${b}, 0.38)`
                            : `rgba(${r}, ${g}, ${b}, 0.16)`;
                    const color = kind === 'high' ? row.textOnColor : kind === 'zero' ? undefined : '#e2e8f0';
                    return (
                      <td
                        key={i}
                        className={`border border-gray-700 px-2 py-2.5 text-center ${countCellClass(kind)}`}
                        style={{ backgroundColor: bg, color }}
                      >
                        {count > 0 ? fmtCount(count) : '—'}
                      </td>
                    );
                  })}
                  <td
                    className="border border-gray-700 px-3 py-2.5 text-center font-extrabold text-gray-100"
                    style={{
                      backgroundColor: `rgba(${r}, ${g}, ${b}, 0.18)`,
                      borderLeft: `6px solid ${row.color}`,
                    }}
                  >
                    {fmtCount(row.total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-800/80">
              <th scope="row" className="border border-gray-700 px-3 py-2.5 text-left font-bold text-gray-100">
                総合計
              </th>
              {monthTotals.map((count, i) => {
                const kind = monthlyCountClass(count, maxMonthTotal);
                return (
                  <td
                    key={i}
                    className={`border border-gray-700 px-2 py-2.5 text-center font-bold ${countCellClass(kind, true)}`}
                  >
                    {count > 0 ? fmtCount(count) : '—'}
                  </td>
                );
              })}
              <td className="border border-gray-700 bg-slate-600 px-3 py-2.5 text-center text-base font-extrabold text-white">
                {fmtCount(total)}
              </td>
            </tr>
          </tfoot>
        </table>
        {loading ? <p className="mt-2 text-xs text-gray-500">集計を読み込み中…</p> : null}
      </div>
    </section>
  );
}
