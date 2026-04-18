'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type DayTriplet = { date_jst: string; new: number; db: number; other: number };

type ApiOk = {
  days: number;
  utterances: {
    totals: { new: number; db: number; other: number };
    byDay: DayTriplet[];
    scanned: number;
    truncated: boolean;
    dbRatioAmongTagged: number | null;
  };
  gemini: {
    tableMissing: boolean;
    songCommentary: {
      calls: number;
      promptTokens: number;
      outputTokens: number;
      byDay: Array<{ date_jst: string; calls: number; promptTokens: number; outputTokens: number }>;
    };
    tidbit: {
      calls: number;
      promptTokens: number;
      outputTokens: number;
      byDay: Array<{ date_jst: string; calls: number; promptTokens: number; outputTokens: number }>;
    };
    scanned: number;
    truncated: boolean;
  };
};

export default function AdminAiCommentOriginPage() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [data, setData] = useState<ApiOk | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch(`/api/admin/ai-comment-origin-stats?days=${days}`, { credentials: 'include' });
      const json = (await res.json().catch(() => ({}))) as ApiOk & { error?: string; hint?: string };
      if (!res.ok) {
        setError(json?.error || '読み込みに失敗しました。');
        setHint(json?.hint ?? null);
        setData(null);
        return;
      }
      setData(json as ApiOk);
    } catch {
      setError('読み込みに失敗しました。');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const u = data?.utterances;
  const pct =
    u?.dbRatioAmongTagged != null ? Math.round(u.dbRatioAmongTagged * 1000) / 10 : null;

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-6xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">AI 発言 NEW / DB 分析</h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              期間
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
          <h2 className="mb-2 font-medium text-gray-200">見方</h2>
          <ul className="list-inside list-disc space-y-2">
            <li>
              <strong className="text-gray-300">発言単位（room_chat_log）</strong>
              … AI メッセージの本文が <code className="rounded bg-gray-800 px-1">[NEW]</code> または{' '}
              <code className="rounded bg-gray-800 px-1">[DB]</code> で始まるかで集計します。曲の comment-pack（基本＋自由）、旧
              commentary API、無言時の豆知識（tidbit）など、ライブラリ再利用時は{' '}
              <code className="rounded bg-gray-800 px-1">[DB]</code>、その場で Gemini 生成したときは{' '}
              <code className="rounded bg-gray-800 px-1">[NEW]</code> です。
            </li>
            <li>
              <strong className="text-gray-300">その他</strong>
              … チャット返答・曲紹介（announce）・案内文など、プレフィックス無しの AI 発言です（この画面の NEW/DB
              比率には含みません）。
            </li>
            <li>
              <strong className="text-gray-300">Gemini API（gemini_usage_logs）</strong>
              … 実際に課金が発生した呼び出し回数・トークンです。下表の「曲解説系」には comment-pack・旧
              commentary・<strong className="text-gray-300">曲解説後クイズ（song_quiz）</strong>
              が含まれます。comment-pack が{' '}
              <strong className="text-gray-300">キャッシュヒット</strong>した場合は API 行が増えず、チャットには{' '}
              <code className="rounded bg-gray-800 px-1">[DB]</code> 発言だけが載る、という差が経費削減の指標になります。
            </li>
          </ul>
        </section>

        {error && (
          <div className="mb-4 space-y-1 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-amber-200">
            <p>{error}</p>
            {hint && <p className="text-sm text-amber-300/90">{hint}</p>}
          </div>
        )}

        {loading ? (
          <p className="text-gray-400">読み込み中…</p>
        ) : u ? (
          <>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              発言単位（保存済みチャットログ）
            </h2>
            <p className="mb-3 text-xs text-gray-500">
              走査: {u.scanned.toLocaleString()} 行
              {u.truncated && <span className="text-amber-400">（上限で打ち切りあり）</span>}
            </p>
            <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-sky-900/60 bg-sky-950/30 p-4">
                <div className="text-xs text-sky-200/80">[NEW] 発言</div>
                <div className="text-2xl font-semibold text-sky-100">{u.totals.new.toLocaleString()}</div>
                <div className="mt-1 text-xs text-sky-300/70">都度生成（ライブラリ未命中時）</div>
              </div>
              <div className="rounded-lg border border-violet-900/60 bg-violet-950/30 p-4">
                <div className="text-xs text-violet-200/80">[DB] 発言</div>
                <div className="text-2xl font-semibold text-violet-100">{u.totals.db.toLocaleString()}</div>
                <div className="mt-1 text-xs text-violet-300/70">DB から再利用</div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">その他 AI 発言</div>
                <div className="text-2xl font-semibold text-gray-200">{u.totals.other.toLocaleString()}</div>
                <div className="mt-1 text-xs text-gray-500">プレフィックス無し</div>
              </div>
              <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-4">
                <div className="text-xs text-emerald-200/80">DB 比率（NEW+DB のみ）</div>
                <div className="text-2xl font-semibold text-emerald-100">
                  {pct != null ? `${pct}%` : '—'}
                </div>
                <div className="mt-1 text-xs text-emerald-300/70">高いほど再利用が進んでいます</div>
              </div>
            </section>

            <section className="mb-10 overflow-x-auto rounded-lg border border-gray-700">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="border-b border-gray-700 bg-gray-800/80">
                  <tr>
                    <th className="px-3 py-2">日付（JST）</th>
                    <th className="px-3 py-2 text-right">[NEW]</th>
                    <th className="px-3 py-2 text-right">[DB]</th>
                    <th className="px-3 py-2 text-right">その他</th>
                    <th className="px-3 py-2 text-right">DB%</th>
                  </tr>
                </thead>
                <tbody>
                  {u.byDay.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                        データがありません
                      </td>
                    </tr>
                  ) : (
                    u.byDay.map((row) => {
                      const sum = row.new + row.db;
                      const dayPct = sum > 0 ? Math.round((row.db / sum) * 1000) / 10 : null;
                      return (
                        <tr key={row.date_jst} className="border-b border-gray-800/80">
                          <td className="px-3 py-2 font-mono text-gray-200">{row.date_jst}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.new.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.db.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                            {row.other.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-300/90">
                            {dayPct != null ? `${dayPct}%` : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </section>

            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Gemini API（課金の目安）
            </h2>
            {data.gemini.tableMissing ? (
              <p className="mb-6 text-sm text-amber-200/90">
                gemini_usage_logs がありません。docs/supabase-gemini-usage-logs-table.md を参照してください。
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs text-gray-500">
                  走査: {data.gemini.scanned.toLocaleString()} 行
                  {data.gemini.truncated && <span className="text-amber-400">（上限で打ち切りあり）</span>}
                </p>
                <div className="mb-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
                    <h3 className="mb-2 text-sm font-medium text-gray-200">
                      曲解説・comment-pack・クイズ（commentary / comment_pack_* / song_quiz）
                    </h3>
                    <p className="text-xs text-gray-500">
                      呼び出し {data.gemini.songCommentary.calls.toLocaleString()} 回 · 入力{' '}
                      {data.gemini.songCommentary.promptTokens.toLocaleString()} · 出力{' '}
                      {data.gemini.songCommentary.outputTokens.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
                    <h3 className="mb-2 text-sm font-medium text-gray-200">豆知識（tidbit）</h3>
                    <p className="text-xs text-gray-500">
                      呼び出し {data.gemini.tidbit.calls.toLocaleString()} 回 · 入力{' '}
                      {data.gemini.tidbit.promptTokens.toLocaleString()} · 出力{' '}
                      {data.gemini.tidbit.outputTokens.toLocaleString()}
                    </p>
                  </div>
                </div>
                <section className="overflow-x-auto rounded-lg border border-gray-700">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="border-b border-gray-700 bg-gray-800/80">
                      <tr>
                        <th className="px-3 py-2">日付（JST）</th>
                        <th className="px-3 py-2 text-right">曲解説・クイズ系 回数</th>
                        <th className="px-3 py-2 text-right">入力Tok</th>
                        <th className="px-3 py-2 text-right">出力Tok</th>
                        <th className="px-3 py-2 text-right">tidbit 回数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const daysSet = new Set<string>();
                        data.gemini.songCommentary.byDay.forEach((d) => daysSet.add(d.date_jst));
                        data.gemini.tidbit.byDay.forEach((d) => daysSet.add(d.date_jst));
                        const sorted = Array.from(daysSet).sort((a, b) => b.localeCompare(a));
                        if (sorted.length === 0) {
                          return (
                            <tr>
                              <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                                該当する API ログがありません
                              </td>
                            </tr>
                          );
                        }
                        const songMap = new Map(data.gemini.songCommentary.byDay.map((d) => [d.date_jst, d]));
                        const tidMap = new Map(data.gemini.tidbit.byDay.map((d) => [d.date_jst, d]));
                        return sorted.map((d) => {
                          const s = songMap.get(d);
                          const t = tidMap.get(d);
                          return (
                            <tr key={d} className="border-b border-gray-800/80">
                              <td className="px-3 py-2 font-mono text-gray-200">{d}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {(s?.calls ?? 0).toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-400">
                                {(s?.promptTokens ?? 0).toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-400">
                                {(s?.outputTokens ?? 0).toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {(t?.calls ?? 0).toLocaleString()}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </section>
              </>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
