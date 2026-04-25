'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type ObservedMetrics = {
  conversationContinuationRate: number;
  suggestionAdoptionRate: number;
  negativeFeedbackRate: number;
  costPerActiveRoomJpy: number;
};

type GateThresholds = {
  minConversationContinuationRate: number;
  minSuggestionAdoptionRate: number;
  maxNegativeFeedbackRate: number;
  maxCostPerActiveRoomJpy: number;
};

type PhaseGateResult = {
  passed: boolean;
  failedReasons: string[];
  thresholds: GateThresholds;
};

type Phase3Readiness = {
  shouldStartPhase3: boolean;
  reasons: string[];
};

type SampleSize = {
  roomChatLog: number;
  commentFeedback: number;
  geminiUsageLogs: number;
  geminiUsageLogsMonthly: number;
};

type ApiResponse = {
  error?: string;
  days: number;
  monthlyDays: number;
  sinceIso: string;
  monthlySinceIso: string;
  observed: ObservedMetrics;
  derived?: {
    externalModelPersonaFitScore?: number;
    monthlyInferenceCostJpy?: number;
  };
  phase1Gate: PhaseGateResult;
  phase3Readiness: Phase3Readiness;
  sampleSize: SampleSize;
  notes: string[];
};

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function fmtJpy(value: number): string {
  return `¥${Math.round(value).toLocaleString()}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP');
  } catch {
    return iso;
  }
}

export default function AdminAiEnginePhaseReadinessPage() {
  const [days, setDays] = useState(7);
  const [monthlyDays, setMonthlyDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        days: String(days),
        monthlyDays: String(monthlyDays),
      });
      const res = await fetch(`/api/admin/ai-engine-phase-readiness?${query.toString()}`, {
        credentials: 'include',
      });
      const json = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok) {
        setError(json.error ?? '読み込みに失敗しました。');
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError('読み込みに失敗しました。');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days, monthlyDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const phase1Pass = data?.phase1Gate.passed === true;
  const phase3Pass = data?.phase3Readiness.shouldStartPhase3 === true;
  const badgeClass = useMemo(
    () =>
      phase1Pass
        ? 'border-emerald-700 bg-emerald-900/25 text-emerald-200'
        : 'border-amber-700 bg-amber-900/25 text-amber-200',
    [phase1Pass],
  );

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-6xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">AIエンジン段階判定</h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              KPI期間
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="rounded border border-gray-600 bg-gray-800 px-2 py-1"
              >
                <option value={7}>7日</option>
                <option value={14}>14日</option>
                <option value={30}>30日</option>
                <option value={60}>60日</option>
                <option value={90}>90日</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              月次コスト期間
              <select
                value={monthlyDays}
                onChange={(e) => setMonthlyDays(Number(e.target.value))}
                className="rounded border border-gray-600 bg-gray-800 px-2 py-1"
              >
                <option value={30}>30日</option>
                <option value={60}>60日</option>
                <option value={90}>90日</option>
                <option value={120}>120日</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded bg-gray-700 px-3 py-1 text-sm hover:bg-gray-600"
            >
              再読込
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-amber-200">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-gray-400">読み込み中…</p>
        ) : !data ? (
          <p className="text-gray-500">データがありません。</p>
        ) : (
          <>
            <section className="mb-4 rounded-lg border border-gray-700 bg-gray-900/50 p-4 text-sm text-gray-300">
              <p>
                KPI集計期間: {fmtDate(data.sinceIso)} 〜 現在（{data.days}日）
              </p>
              <p>
                月次コスト期間: {fmtDate(data.monthlySinceIso)} 〜 現在（{data.monthlyDays}日）
              </p>
            </section>

            <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">会話継続率</div>
                <div className="text-2xl font-semibold text-sky-300">
                  {pct(data.observed.conversationContinuationRate)}
                </div>
                <div className="text-xs text-gray-500">
                  閾値 {pct(data.phase1Gate.thresholds.minConversationContinuationRate)} 以上
                </div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">提案採用率</div>
                <div className="text-2xl font-semibold text-emerald-300">
                  {pct(data.observed.suggestionAdoptionRate)}
                </div>
                <div className="text-xs text-gray-500">
                  閾値 {pct(data.phase1Gate.thresholds.minSuggestionAdoptionRate)} 以上
                </div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">ネガ評価率</div>
                <div className="text-2xl font-semibold text-amber-300">
                  {pct(data.observed.negativeFeedbackRate)}
                </div>
                <div className="text-xs text-gray-500">
                  閾値 {pct(data.phase1Gate.thresholds.maxNegativeFeedbackRate)} 以下
                </div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">ルーム当たりコスト</div>
                <div className="text-2xl font-semibold text-violet-300">
                  {fmtJpy(data.observed.costPerActiveRoomJpy)}
                </div>
                <div className="text-xs text-gray-500">
                  閾値 {fmtJpy(data.phase1Gate.thresholds.maxCostPerActiveRoomJpy)} 以下
                </div>
              </div>
            </section>

            <section className="mb-6 grid gap-4 md:grid-cols-2">
              <div className={`rounded-lg border p-4 ${badgeClass}`}>
                <div className="mb-1 text-sm font-medium">フェーズ1判定</div>
                <div className="text-lg font-semibold">{phase1Pass ? 'PASS（フェーズ2へ進行可能）' : 'HOLD（改善継続）'}</div>
                {data.phase1Gate.failedReasons.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm">
                    {data.phase1Gate.failedReasons.map((r, i) => (
                      <li key={`${r}-${i}`}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div
                className={`rounded-lg border p-4 ${
                  phase3Pass
                    ? 'border-emerald-700 bg-emerald-900/25 text-emerald-200'
                    : 'border-gray-700 bg-gray-900/50 text-gray-200'
                }`}
              >
                <div className="mb-1 text-sm font-medium">フェーズ3（独自LLM）判定</div>
                <div className="text-lg font-semibold">
                  {phase3Pass ? 'START（独自化開始条件を満たす）' : 'NOT YET（準備またはトリガー不足）'}
                </div>
                <div className="mt-2 text-sm text-gray-300">
                  人格再現スコア: {pct(data.derived?.externalModelPersonaFitScore ?? 0)}
                </div>
                <div className="text-sm text-gray-300">
                  月次推論コスト: {fmtJpy(data.derived?.monthlyInferenceCostJpy ?? 0)}
                </div>
                {data.phase3Readiness.reasons.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm text-gray-300">
                    {data.phase3Readiness.reasons.map((r, i) => (
                      <li key={`${r}-${i}`}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="mb-6 rounded-lg border border-gray-700 bg-gray-900/50 p-4">
              <h2 className="mb-2 text-sm font-medium text-gray-200">集計サンプル件数</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm text-gray-300">
                <div>room_chat_log: {data.sampleSize.roomChatLog.toLocaleString()}</div>
                <div>comment_feedback: {data.sampleSize.commentFeedback.toLocaleString()}</div>
                <div>gemini_usage_logs(KPI): {data.sampleSize.geminiUsageLogs.toLocaleString()}</div>
                <div>gemini_usage_logs(月次): {data.sampleSize.geminiUsageLogsMonthly.toLocaleString()}</div>
              </div>
            </section>

            <section className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
              <h2 className="mb-2 text-sm font-medium text-gray-200">注記</h2>
              <ul className="list-inside list-disc space-y-1 text-sm text-gray-300">
                {data.notes.map((n, i) => (
                  <li key={`${n}-${i}`}>{n}</li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
