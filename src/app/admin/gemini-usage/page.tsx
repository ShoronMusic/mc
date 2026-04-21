'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type LogRow = {
  id: string;
  context: string;
  model: string;
  prompt_token_count: number | null;
  output_token_count: number | null;
  total_token_count: number | null;
  room_id: string | null;
  video_id: string | null;
  created_at: string;
};

type TokenSummary = {
  calls: number;
  promptTokens: number;
  outputTokens: number;
};

/** Gemini Developer API の公式料金（モデル別の入力・出力単価） */
const GEMINI_PRICING_URL = 'https://ai.google.dev/pricing';

/** Google AI Studio 左メニュー「使用量」に相当（リクエスト・トークン・エラーなど） */
const GOOGLE_AI_STUDIO_USAGE_URL = 'https://aistudio.google.com/usage?timeRange=last-28-days';

/** Google AI Studio 左メニュー「利用額」に相当（日別の利用額・上限） */
const GOOGLE_AI_STUDIO_SPEND_URL = 'https://aistudio.google.com/spend';

const PRICING_PER_1M_USD: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-3.1-pro-preview': { input: 2.0, output: 12 },
};

function calcCostUsd(promptTokens: number, outputTokens: number, model: string): number {
  const p = PRICING_PER_1M_USD[model];
  if (!p) return 0;
  return (promptTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

const CONTEXT_HELP: Record<string, string> = {
  chat_reply: 'チャットへの AI 返答',
  tidbit: '30秒無発言の豆知識（再生中・直前の曲に紐づくもののみ。洋楽全般の雑談はオフ）',
  commentary: '曲解説（曲を貼った直後の基本コメント）',
  get_song_style: '曲スタイル分類（Pop/Rock 等）',
  get_song_era: '曲の年代ラベル分類',
  extract_song_search: '「曲を貼って」系の検索クエリ抽出',
  comment_pack_base: 'comment-pack の基本コメント',
  comment_pack_free_1: 'comment-pack 自由コメント1',
  comment_pack_free_2: 'comment-pack 自由コメント2',
  comment_pack_free_3: 'comment-pack 自由コメント3',
  comment_pack_free_4: 'comment-pack 自由コメント4',
  comment_pack_session_bridge: 'comment-pack ライブラリ返却時の会話つなぎ（直近チャットあり）',
  song_quiz: '曲解説後の三択クイズ生成（/api/ai/song-quiz）',
  next_song_recommend: '「次に聴くなら（試験）」のおすすめ曲生成',
  next_song_recomend: '「次に聴くなら（試験）」のおすすめ曲生成（旧キー）',
  question_guard_classify: '「@」音楽関連の二次判定（質問ガード分類）',
  user_taste_auto_profile: 'マイページ・履歴からの自動趣向プロフィール生成',
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP');
  } catch {
    return iso;
  }
}

export default function AdminGeminiUsagePage() {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState({ calls: 0, promptTokens: 0, outputTokens: 0 });
  const [byContext, setByContext] = useState<Record<string, TokenSummary>>({});
  const [byModel, setByModel] = useState<Record<string, TokenSummary>>({});
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [planMonthlySongs, setPlanMonthlySongs] = useState(500);
  const [planMonthlyUsers, setPlanMonthlyUsers] = useState(30);
  const [planSafetyMultiplier, setPlanSafetyMultiplier] = useState(1.2);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/gemini-usage?days=${days}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || '読み込みに失敗しました。');
        setLogs([]);
        setTotals({ calls: 0, promptTokens: 0, outputTokens: 0 });
        setByContext({});
        setByModel({});
        return;
      }
      setTotals(data.totals ?? { calls: 0, promptTokens: 0, outputTokens: 0 });
      setByContext(data.byContext ?? {});
      setByModel(data.byModel ?? {});
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      setError('読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const ctxEntries = Object.entries(byContext).sort((a, b) => b[1].calls - a[1].calls);
  const modelEntries = Object.entries(byModel).sort((a, b) => b[1].calls - a[1].calls);
  const totalCostUsd = modelEntries.reduce(
    (sum, [model, v]) => sum + calcCostUsd(v.promptTokens, v.outputTokens, model),
    0
  );
  const approxSongCount = byContext.comment_pack_base?.calls ?? 0;
  const perSongUsd = approxSongCount > 0 ? totalCostUsd / approxSongCount : 0;
  const usdToJpy = 160;
  const estimatedSongsPerDay = days > 0 ? approxSongCount / days : 0;
  const projectedMonthlySongsFromTrend = estimatedSongsPerDay * 30;
  const projectedMonthlyUsdFromTrend = projectedMonthlySongsFromTrend * perSongUsd;
  const plannedMonthlyUsd = planMonthlySongs * perSongUsd * planSafetyMultiplier;
  const plannedMonthlyJpy = plannedMonthlyUsd * usdToJpy;
  const plannedPerUserMonthlyJpy = planMonthlyUsers > 0 ? plannedMonthlyJpy / planMonthlyUsers : 0;

  const blendedInputUsdPerM =
    totals.promptTokens > 0
      ? modelEntries.reduce((sum, [model, v]) => sum + calcCostUsd(v.promptTokens, 0, model), 0) *
        (1_000_000 / totals.promptTokens)
      : 0;
  const blendedOutputUsdPerM =
    totals.outputTokens > 0
      ? modelEntries.reduce((sum, [model, v]) => sum + calcCostUsd(0, v.outputTokens, model), 0) *
        (1_000_000 / totals.outputTokens)
      : 0;

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-6xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Gemini 利用ログ</h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              期間
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="rounded border border-gray-600 bg-gray-800 px-2 py-1"
              >
                <option value={1}>過去1日</option>
                <option value={7}>過去7日</option>
                <option value={30}>過去30日</option>
                <option value={90}>過去90日</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => load()}
              className="rounded bg-gray-700 px-3 py-1 text-sm hover:bg-gray-600"
            >
              再読込
            </button>
            <a
              href={GOOGLE_AI_STUDIO_USAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-sky-800/70 bg-sky-950/50 px-3 py-1 text-sm text-sky-200 hover:border-sky-600 hover:bg-sky-900/40"
            >
              AI Studio · 使用量↗
            </a>
            <a
              href={GOOGLE_AI_STUDIO_SPEND_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-violet-800/70 bg-violet-950/50 px-3 py-1 text-sm text-violet-200 hover:border-violet-600 hover:bg-violet-900/40"
            >
              AI Studio · 利用額↗
            </a>
            <a
              href={GEMINI_PRICING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-emerald-800/70 bg-emerald-950/50 px-3 py-1 text-sm text-emerald-200 hover:border-emerald-600 hover:bg-emerald-900/40"
            >
              料金表（単価・公式）↗
            </a>
            <Link
              href="/admin/ai-comment-origin"
              className="rounded border border-gray-600 bg-gray-800/80 px-3 py-1 text-sm text-gray-200 hover:bg-gray-700"
            >
              NEW/DB 分析
            </Link>
          </div>
        </div>

        <section className="mb-6 rounded-lg border border-gray-700 bg-gray-900/50 p-4 text-sm">
          <h2 className="mb-2 font-medium text-gray-200">どんなログか</h2>
          <ul className="list-inside list-disc space-y-1 text-gray-400">
            <li>
              この画面のトークン数から概算コストを把握するには、{' '}
              <a
                href={GEMINI_PRICING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 underline decoration-emerald-600/60 underline-offset-2 hover:text-emerald-300"
              >
                Gemini API の料金表（公式）
              </a>
              で利用中のモデル名の入力・出力単価を確認し、下の集計に掛け算してください。Google 側の公式ダッシュボードは{' '}
              <a
                href={GOOGLE_AI_STUDIO_USAGE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 underline decoration-sky-600/60 underline-offset-2 hover:text-sky-300"
              >
                AI Studio · 使用量
              </a>
              {' / '}
              <a
                href={GOOGLE_AI_STUDIO_SPEND_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 underline decoration-violet-600/60 underline-offset-2 hover:text-violet-300"
              >
                AI Studio · 利用額
              </a>
              から直接開けます。
            </li>
            <li>
              <strong className="text-gray-300">入力トークン</strong>（prompt）… プロンプト・会話履歴の量。料金の入力単価に掛け算。
            </li>
            <li>
              <strong className="text-gray-300">出力トークン</strong>（output）… AI が返した文字量。料金の出力単価に掛け算。
            </li>
            <li>
              <strong className="text-gray-300">context</strong>… どの機能で呼んだか（下表の「種別」）。
            </li>
            <li>
              保存には <code className="rounded bg-gray-800 px-1">SUPABASE_SERVICE_ROLE_KEY</code> とテーブル{' '}
              <code className="rounded bg-gray-800 px-1">gemini_usage_logs</code> が必要です（
              <code className="rounded bg-gray-800 px-1">docs/supabase-gemini-usage-logs-table.md</code>）。
            </li>
            <li>
              コンソールだけ見たい場合は <code className="rounded bg-gray-800 px-1">GEMINI_LOG_USAGE=1</code>。
            </li>
          </ul>
        </section>

        {error && (
          <p className="mb-4 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-amber-200">{error}</p>
        )}

        {loading ? (
          <p className="text-gray-400">読み込み中…</p>
        ) : (
          <>
            <section className="mb-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">呼び出し回数（期間内）</div>
                <div className="text-2xl font-semibold">{totals.calls.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">入力トークン合計</div>
                <div className="text-2xl font-semibold text-sky-300">{totals.promptTokens.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">出力トークン合計</div>
                <div className="text-2xl font-semibold text-emerald-300">{totals.outputTokens.toLocaleString()}</div>
              </div>
            </section>

            <section className="mb-6 rounded-lg border border-gray-700 bg-gray-900/50 p-4">
              <h2 className="mb-3 text-sm font-medium text-gray-200">テスト運用向け 試算ツール</h2>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-gray-400">
                  想定 月間曲数
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={planMonthlySongs}
                    onChange={(e) => setPlanMonthlySongs(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-gray-100"
                  />
                </label>
                <label className="text-xs text-gray-400">
                  想定 月間アクティブユーザー数
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={planMonthlyUsers}
                    onChange={(e) => setPlanMonthlyUsers(Math.max(1, Number(e.target.value) || 1))}
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-gray-100"
                  />
                </label>
                <label className="text-xs text-gray-400">
                  安全係数（再生成・バースト吸収）
                  <input
                    type="number"
                    min={1}
                    step={0.05}
                    value={planSafetyMultiplier}
                    onChange={(e) => setPlanSafetyMultiplier(Math.max(1, Number(e.target.value) || 1))}
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-gray-100"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded border border-gray-700 bg-gray-950/50 p-3">
                  <div className="text-xs text-gray-500">現在トレンド（日次）</div>
                  <div className="text-lg font-semibold text-sky-300">{estimatedSongsPerDay.toFixed(2)} 曲/日</div>
                </div>
                <div className="rounded border border-gray-700 bg-gray-950/50 p-3">
                  <div className="text-xs text-gray-500">トレンド月間費用（30日）</div>
                  <div className="text-lg font-semibold text-violet-300">${projectedMonthlyUsdFromTrend.toFixed(2)}</div>
                  <div className="text-xs font-semibold text-violet-200">約 ¥{(projectedMonthlyUsdFromTrend * usdToJpy).toFixed(0)}</div>
                </div>
                <div className="rounded border border-gray-700 bg-gray-950/50 p-3">
                  <div className="text-xs text-gray-500">計画月間費用（安全係数込み）</div>
                  <div className="text-lg font-semibold text-amber-300">${plannedMonthlyUsd.toFixed(2)}</div>
                  <div className="text-xs font-semibold text-amber-200">約 ¥{plannedMonthlyJpy.toFixed(0)}</div>
                </div>
                <div className="rounded border border-gray-700 bg-gray-950/50 p-3">
                  <div className="text-xs text-gray-500">ユーザー1人あたり目安/月</div>
                  <div className="text-lg font-semibold text-emerald-300">¥{plannedPerUserMonthlyJpy.toFixed(0)}</div>
                  <div className="text-xs text-gray-500">
                    ¥{planMonthlyUsers > 0 ? (plannedPerUserMonthlyJpy / 30).toFixed(1) : '0.0'} /日
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">概算料金（期間内）</div>
                <div className="text-2xl font-semibold text-violet-300">${totalCostUsd.toFixed(4)}</div>
                <div className="mt-1 text-sm font-semibold text-violet-200">
                  約 ¥{(totalCostUsd * usdToJpy).toFixed(2)}
                  <span className="ml-1 text-xs font-normal text-gray-400">（$1=¥{usdToJpy}）</span>
                </div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">1曲あたり概算</div>
                <div className="text-2xl font-semibold text-amber-300">
                  {approxSongCount > 0 ? `$${perSongUsd.toFixed(4)}` : '—'}
                </div>
                <div className="mt-1 text-sm font-semibold text-amber-200">
                  {approxSongCount > 0
                    ? `約 ¥${(perSongUsd * usdToJpy).toFixed(2)}（comment_pack_base=${approxSongCount}曲換算）`
                    : 'comment_pack_base の記録がないため算出不可'}
                </div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">計算対象モデル</div>
                <div className="text-sm text-gray-300">
                  {modelEntries.length > 0
                    ? modelEntries.map(([model, v]) => `${model} (${v.calls})`).join(', ')
                    : '—'}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  未対応モデルは概算に含まれません
                </div>
              </div>
            </section>

            <section className="mb-6">
              <h2 className="mb-2 text-sm font-medium text-gray-300">種別ごとの内訳</h2>
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-gray-700 bg-gray-800/80">
                    <tr>
                      <th className="px-3 py-2">種別（context）</th>
                      <th className="px-3 py-2">説明</th>
                      <th className="px-3 py-2 text-right">回数</th>
                      <th className="px-3 py-2 text-right">入力</th>
                      <th className="px-3 py-2 text-right">出力</th>
                      <th className="px-3 py-2 text-right">概算料金(USD)</th>
                      <th className="px-3 py-2 text-right">概算料金(円)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ctxEntries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-center text-gray-500">
                          データがありません
                        </td>
                      </tr>
                    ) : (
                      ctxEntries.map(([key, v]) => {
                        const costUsd =
                          (v.promptTokens / 1_000_000) * blendedInputUsdPerM +
                          (v.outputTokens / 1_000_000) * blendedOutputUsdPerM;
                        return (
                          <tr key={key} className="border-b border-gray-800">
                            <td className="px-3 py-1.5 font-mono text-xs text-gray-300">{key}</td>
                            <td className="px-3 py-1.5 text-gray-400">{CONTEXT_HELP[key] ?? '—'}</td>
                            <td className="px-3 py-1.5 text-right">{v.calls}</td>
                            <td className="px-3 py-1.5 text-right text-sky-200/90">{v.promptTokens.toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-200/90">{v.outputTokens.toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-right text-violet-200/90">${costUsd.toFixed(4)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-amber-200">
                              ¥{(costUsd * usdToJpy).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-sm font-medium text-gray-300">直近の記録（最大400件）</h2>
              <div className="max-h-[480px] overflow-auto rounded-lg border border-gray-700">
                <table className="w-full min-w-[820px] text-left text-xs">
                  <thead className="sticky top-0 border-b border-gray-700 bg-gray-800/95">
                    <tr>
                      <th className="px-2 py-1.5">日時</th>
                      <th className="px-2 py-1.5">種別</th>
                      <th className="px-2 py-1.5">model</th>
                      <th className="px-2 py-1.5 text-right">入力</th>
                      <th className="px-2 py-1.5 text-right">出力</th>
                      <th className="px-2 py-1.5">room</th>
                      <th className="px-2 py-1.5">video</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((r) => (
                      <tr key={r.id} className="border-b border-gray-800/80">
                        <td className="whitespace-nowrap px-2 py-1 text-gray-400">{formatTime(r.created_at)}</td>
                        <td className="px-2 py-1 font-mono text-gray-300">{r.context}</td>
                        <td className="max-w-[200px] truncate px-2 py-1 font-mono text-gray-400" title={r.model}>
                          {r.model || '—'}
                        </td>
                        <td className="px-2 py-1 text-right">{r.prompt_token_count ?? '—'}</td>
                        <td className="px-2 py-1 text-right">{r.output_token_count ?? '—'}</td>
                        <td className="max-w-[80px] truncate px-2 py-1 text-gray-500" title={r.room_id ?? ''}>
                          {r.room_id ?? '—'}
                        </td>
                        <td className="max-w-[100px] truncate px-2 py-1 text-gray-500" title={r.video_id ?? ''}>
                          {r.video_id ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
