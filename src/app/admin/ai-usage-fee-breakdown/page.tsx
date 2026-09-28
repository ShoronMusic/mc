'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { AdminProductFilterSelect } from '@/components/admin/AdminProductFilterSelect';
import {
  AI_USAGE_FEE_CATEGORY_IDS,
  AI_USAGE_FEE_CATEGORY_LABEL,
  type AiUsageFeeBreakdown,
  type AiUsageFeeCell,
  type AiUsageFeePeriodRow,
  type AiUsageFeePersonRow,
  type AiUsageFeeSide,
} from '@/lib/admin-ai-usage-fee-breakdown';
import { formatGeminiCostJpyApprox } from '@/lib/gemini-pricing';

function FeeCellView({ cell }: { cell: AiUsageFeeCell }) {
  if (cell.calls <= 0) {
    return <span className="text-gray-600">—</span>;
  }
  return (
    <span>
      <span className="text-gray-100">{formatGeminiCostJpyApprox(cell.costJpyApprox)}</span>
      <span className="mt-0.5 block text-[10px] text-gray-500">{cell.calls}回</span>
    </span>
  );
}

function sideCells(side: AiUsageFeeSide) {
  return (
    <>
      {AI_USAGE_FEE_CATEGORY_IDS.map((id) => (
        <td key={id} className="px-2 py-1.5 align-top whitespace-nowrap">
          <FeeCellView cell={side.byCategory[id]} />
        </td>
      ))}
      <td className="px-2 py-1.5 align-top whitespace-nowrap font-medium text-amber-100/90">
        <FeeCellView cell={side.total} />
      </td>
    </>
  );
}

function PeriodTable({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: AiUsageFeePeriodRow[];
  emptyLabel: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
      <div className="mt-2 max-h-[32rem] overflow-auto rounded border border-gray-800">
        <table className="min-w-full text-left text-xs">
          <thead className="sticky top-0 bg-gray-900 text-gray-400">
            <tr>
              <th className="px-2 py-2">期間</th>
              <th className="px-2 py-2">負担</th>
              {AI_USAGE_FEE_CATEGORY_IDS.map((id) => (
                <th key={id} className="px-2 py-2">
                  {AI_USAGE_FEE_CATEGORY_LABEL[id]}
                </th>
              ))}
              <th className="px-2 py-2">合計</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-2 py-4 text-center text-gray-500">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <Fragment key={row.key}>
                  <tr className="border-t border-gray-800">
                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-200" rowSpan={2}>
                      {row.label}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-emerald-200/90">使用者</td>
                    {sideCells(row.user)}
                  </tr>
                  <tr className="border-t border-gray-800/70 bg-amber-950/10">
                    <td className="px-2 py-1.5 whitespace-nowrap text-amber-200/90">主催者</td>
                    {sideCells(row.organizer)}
                  </tr>
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PersonTable({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: AiUsageFeePersonRow[];
  emptyLabel: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
      <div className="mt-2 max-h-[32rem] overflow-auto rounded border border-gray-800">
        <table className="min-w-full text-left text-xs">
          <thead className="sticky top-0 bg-gray-900 text-gray-400">
            <tr>
              <th className="px-2 py-2">名前</th>
              {AI_USAGE_FEE_CATEGORY_IDS.map((id) => (
                <th key={id} className="px-2 py-2">
                  {AI_USAGE_FEE_CATEGORY_LABEL[id]}
                </th>
              ))}
              <th className="px-2 py-2">合計</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-2 py-4 text-center text-gray-500">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.userId} className="border-t border-gray-800">
                  <td className="px-2 py-1.5">
                    <span className="font-medium text-gray-100">{row.displayName}</span>
                    {row.userId.startsWith('__') ? null : (
                      <span className="mt-0.5 block font-mono text-[10px] text-gray-600">
                        {row.userId.slice(0, 8)}…
                      </span>
                    )}
                  </td>
                  {AI_USAGE_FEE_CATEGORY_IDS.map((id) => (
                    <td key={id} className="px-2 py-1.5 align-top whitespace-nowrap">
                      <FeeCellView cell={row.byCategory[id]} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 align-top whitespace-nowrap font-medium text-amber-100/90">
                    <FeeCellView cell={row.total} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminAiUsageFeeBreakdownPage() {
  const [productFilter, setProductFilter] = useState<'all' | 'musicaichat' | 'musicchat'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<AiUsageFeeBreakdown | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const params = new URLSearchParams({ product: productFilter });
      const res = await fetch(`/api/admin/ai-usage-fee-breakdown?${params}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : '読み込みに失敗しました。');
        setBreakdown(null);
        return;
      }
      if (data?.enabled === false) {
        setHint(typeof data?.hint === 'string' ? data.hint : '集計できません。');
        setBreakdown(null);
        return;
      }
      setBreakdown((data?.breakdown ?? null) as AiUsageFeeBreakdown | null);
    } catch {
      setError('読み込みに失敗しました。');
      setBreakdown(null);
    } finally {
      setLoading(false);
    }
  }, [productFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const summaryRows = breakdown
    ? [breakdown.summary.total, breakdown.summary.month, breakdown.summary.today]
    : [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-[90rem] px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">AI 使用料（月・日・累計）</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
        Gemini API の原価試算です。曲解説・クイズ・おすすめ・エージェント発言・エージェント選曲・@質問・その他を、使用者負担と主催者負担に分けて表示します。参加者のクレジット消費額ではありません。
      </p>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-gray-500">
        エージェント発言は今後のログから主催者側に分かれます。それ以前の発言は @質問（chat_reply）に含まれます。日付は日本時間です。
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <AdminProductFilterSelect value={productFilter} onChange={setProductFilter} />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-gray-600 px-3 py-1.5 text-sm hover:bg-gray-800"
        >
          再読み込み
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      {hint ? <p className="mt-4 text-sm text-amber-200/90">{hint}</p> : null}
      {breakdown?.truncated ? (
        <p className="mt-4 text-sm text-amber-200/90">
          ログが上限（4万件）に達したため、新しい順の4万件までを集計しています。それより古い分は累計に含まれません。
        </p>
      ) : null}
      {breakdown ? (
        <p className="mt-3 text-xs text-gray-500">集計件数 {breakdown.rowCount.toLocaleString()} 件</p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">読み込み中…</p>
      ) : breakdown ? (
        <>
          <PeriodTable title="累計・今月・今日" rows={summaryRows} emptyLabel="記録がありません。" />
          <PeriodTable title="月別" rows={breakdown.months} emptyLabel="月別の記録がありません。" />
          <PeriodTable title="日別" rows={breakdown.days} emptyLabel="日別の記録がありません。" />
          <PersonTable
            title="使用者別（累計）"
            rows={breakdown.users}
            emptyLabel="使用者負担の記録がありません。"
          />
          <PersonTable
            title="主催者別（累計）"
            rows={breakdown.organizers}
            emptyLabel="主催者負担の記録がありません。"
          />
        </>
      ) : null}

      <p className="mt-8 text-xs text-gray-600">
        関連:{' '}
        <Link href="/admin/user-billing-usage" className="text-blue-400 hover:underline">
          ユーザー別 AI 利用
        </Link>
        {' · '}
        <Link href="/admin/gathering-history" className="text-blue-400 hover:underline">
          開催履歴
        </Link>
        {' · '}
        <Link href="/admin/gemini-usage" className="text-blue-400 hover:underline">
          Gemini 利用ログ
        </Link>
      </p>
    </main>
  );
}
