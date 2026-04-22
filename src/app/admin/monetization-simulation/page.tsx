import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

/** docs/monetization-options.md「シナリオA 想定シミュレーション表（5〜10月）」と同一前提（r=0.30） */
const SCENARIO_A_ROWS = [
  {
    month: '05',
    monthLabel: '2026年5月',
    uu: 50,
    revenue: 50_000,
    netAfterFee: 48_200,
    variable: 11_400,
    fixed: 45_000,
    monthlyProfit: -8_200,
    cumFromMay: -8_200,
    cumFromApr: -53_200,
  },
  {
    month: '06',
    monthLabel: '2026年6月',
    uu: 100,
    revenue: 100_000,
    netAfterFee: 96_400,
    variable: 22_800,
    fixed: 45_000,
    monthlyProfit: 28_600,
    cumFromMay: 20_400,
    cumFromApr: -24_600,
  },
  {
    month: '07',
    monthLabel: '2026年7月',
    uu: 150,
    revenue: 150_000,
    netAfterFee: 144_600,
    variable: 34_200,
    fixed: 45_000,
    monthlyProfit: 65_400,
    cumFromMay: 85_800,
    cumFromApr: 40_800,
  },
  {
    month: '08',
    monthLabel: '2026年8月',
    uu: 200,
    revenue: 200_000,
    netAfterFee: 192_800,
    variable: 45_600,
    fixed: 45_000,
    monthlyProfit: 102_200,
    cumFromMay: 188_000,
    cumFromApr: 143_000,
  },
  {
    month: '09',
    monthLabel: '2026年9月',
    uu: 250,
    revenue: 250_000,
    netAfterFee: 241_000,
    variable: 57_000,
    fixed: 45_000,
    monthlyProfit: 139_000,
    cumFromMay: 327_000,
    cumFromApr: 282_000,
  },
  {
    month: '10',
    monthLabel: '2026年10月',
    uu: 300,
    revenue: 300_000,
    netAfterFee: 289_200,
    variable: 68_400,
    fixed: 45_000,
    monthlyProfit: 175_800,
    cumFromMay: 502_800,
    cumFromApr: 457_800,
  },
] as const;

const TOTALS = {
  revenue: 1_050_000,
  netAfterFee: 1_012_200,
  variable: 239_400,
  fixed: 270_000,
  monthlyProfit: 502_800,
};

/** 損益列用（正は先頭に +） */
function formatSignedYen(n: number): string {
  if (n > 0) return `+${n.toLocaleString('ja-JP')}円`;
  if (n < 0) return `−${Math.abs(n).toLocaleString('ja-JP')}円`;
  return `0円`;
}

function formatYenPlain(n: number): string {
  return `${n.toLocaleString('ja-JP')}円`;
}

export default function AdminMonetizationSimulationPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />

      <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        収支シミュレーション（案）— シナリオA
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
        有料化・収益モデル整理メモ（リポジトリ{' '}
        <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-amber-100/90">
          docs/monetization-options.md
        </code>
        ）の<strong className="text-gray-200">半期シミュレーション</strong>
        から、<strong className="text-gray-200">2026年5月〜10月・シナリオA</strong>
        の表と諸条件を表示します。実績に合わせ数値・前提はドキュメント側を正として更新してください。
      </p>

      <section className="mt-8 rounded-xl border border-gray-800 bg-gray-900/50 p-5 sm:p-6" aria-labelledby="conditions-heading">
        <h2 id="conditions-heading" className="text-lg font-semibold text-amber-200/95">
          諸条件（この表の前提）
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-gray-800/80 bg-gray-950/40 p-3">
            <dt className="font-medium text-gray-300">シナリオ</dt>
            <dd className="mt-1 text-gray-400">
              <strong className="text-gray-200">A</strong>：4月末有料{' '}
              <strong className="text-gray-200">0人</strong> → 10月末{' '}
              <strong className="text-gray-200">300人</strong>（毎月 <strong className="text-gray-200">+50人</strong>）
            </dd>
          </div>
          <div className="rounded-lg border border-gray-800/80 bg-gray-950/40 p-3">
            <dt className="font-medium text-gray-300">プラン想定</dt>
            <dd className="mt-1 text-gray-400">
              月額 <strong className="text-gray-200">1,000円/人</strong>、利用上限{' '}
              <strong className="text-gray-200">300曲/月</strong>（上限まで使い切るストレス試算）
            </dd>
          </div>
          <div className="rounded-lg border border-gray-800/80 bg-gray-950/40 p-3">
            <dt className="font-medium text-gray-300">原価ブレンド（NEW級の割合）</dt>
            <dd className="mt-1 text-gray-400">
              <strong className="text-gray-200">r = 0.30</strong>（基準）。2クレジット級（NEW極）1.60円/曲、1クレジット級（DB極）0.40円/曲で加重 → 1人あたり月次変動費{' '}
              <strong className="text-gray-200">228円</strong>、限界利益（固定前）{' '}
              <strong className="text-gray-200">736円</strong>
            </dd>
          </div>
          <div className="rounded-lg border border-gray-800/80 bg-gray-950/40 p-3">
            <dt className="font-medium text-gray-300">決済・固定費</dt>
            <dd className="mt-1 text-gray-400">
              手数料 <strong className="text-gray-200">3.6%</strong>（手取り ×0.964）。月次固定費{' '}
              <strong className="text-gray-200">45,000円</strong>
            </dd>
          </div>
          <div className="rounded-lg border border-gray-800/80 bg-gray-950/40 p-3 sm:col-span-2">
            <dt className="font-medium text-gray-300">月次損益の簡式</dt>
            <dd className="mt-1 font-mono text-xs text-gray-400 sm:text-sm">
              期末有料UU × 736 − 45,000（＝手取り − 変動費 − 固定費 と同値）
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-gray-500">
          課金売上は各月末UU × 1,000円（全員フル課金）。単位は税別参考。累積（4月含む）は4月のみ固定費{' '}
          <span className="text-gray-400">−45,000円</span>（有料0人）を先に計上した通期イメージ。
        </p>
      </section>

      <section className="mt-8" aria-labelledby="table-heading">
        <h2 id="table-heading" className="text-lg font-semibold text-amber-200/95">
          想定シミュレーション表（5〜10月）
        </h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-800">
          <table className="min-w-[56rem] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-950/80">
                <th scope="col" className="sticky left-0 z-10 bg-gray-950/95 px-3 py-3 font-medium text-gray-300">
                  月
                </th>
                <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                  期末有料UU
                </th>
                <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                  課金売上（MRR）
                </th>
                <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                  決済手取り
                </th>
                <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                  変動費（×228）
                </th>
                <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                  固定費
                </th>
                <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                  月次損益
                </th>
                <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                  累積（5月〜）
                </th>
                <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                  累積（4月〜）
                </th>
              </tr>
            </thead>
            <tbody>
              {SCENARIO_A_ROWS.map((row) => (
                <tr key={row.month} className="border-b border-gray-800/90 odd:bg-gray-900/30 even:bg-gray-900/10">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 whitespace-nowrap bg-gray-900/95 px-3 py-2.5 font-medium text-gray-200"
                  >
                    <span className="text-amber-200/90">{row.month}</span>
                    <span className="ml-2 hidden font-normal text-gray-500 sm:inline">({row.monthLabel})</span>
                  </th>
                  <td className="px-3 py-2.5 tabular-nums text-gray-200">{row.uu.toLocaleString('ja-JP')}人</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-300">{formatYenPlain(row.revenue)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-300">{formatYenPlain(row.netAfterFee)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-400">{formatYenPlain(row.variable)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-400">{formatYenPlain(row.fixed)}</td>
                  <td
                    className={`px-3 py-2.5 tabular-nums font-medium ${
                      row.monthlyProfit >= 0 ? 'text-emerald-300/95' : 'text-rose-300/95'
                    }`}
                  >
                    {formatSignedYen(row.monthlyProfit)}
                  </td>
                  <td
                    className={`px-3 py-2.5 tabular-nums ${
                      row.cumFromMay >= 0 ? 'text-emerald-200/90' : 'text-rose-200/90'
                    }`}
                  >
                    {formatSignedYen(row.cumFromMay)}
                  </td>
                  <td
                    className={`px-3 py-2.5 tabular-nums ${
                      row.cumFromApr >= 0 ? 'text-emerald-200/90' : 'text-rose-200/90'
                    }`}
                  >
                    {formatSignedYen(row.cumFromApr)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-700 bg-gray-950/70 font-medium">
                <th scope="row" className="sticky left-0 z-10 bg-gray-950/95 px-3 py-3 text-amber-200/90">
                  計（5〜10月）
                </th>
                <td className="px-3 py-3 text-gray-500">—</td>
                <td className="px-3 py-3 tabular-nums text-gray-200">{formatYenPlain(TOTALS.revenue)}</td>
                <td className="px-3 py-3 tabular-nums text-gray-200">{formatYenPlain(TOTALS.netAfterFee)}</td>
                <td className="px-3 py-3 tabular-nums text-gray-400">{formatYenPlain(TOTALS.variable)}</td>
                <td className="px-3 py-3 tabular-nums text-gray-400">{formatYenPlain(TOTALS.fixed)}</td>
                <td className="px-3 py-3 tabular-nums text-emerald-300/95">{formatSignedYen(TOTALS.monthlyProfit)}</td>
                <td className="px-3 py-3 text-gray-500">—</td>
                <td className="px-3 py-3 text-gray-500">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="mt-4 list-inside list-disc space-y-1 text-xs text-gray-500">
          <li>5〜10月の月次損益の合算は {formatSignedYen(TOTALS.monthlyProfit)}（手取り合計 − 変動合計 − 固定6か月）。</li>
          <li>
            累積黒字に転じる月（4月含む）: <strong className="text-gray-400">7月末</strong>（累積 +40,800円）。赤字ピークは{' '}
            <strong className="text-gray-400">6月末</strong>（−24,600円）。
          </li>
        </ul>
      </section>

      <p className="mt-8 text-center text-xs text-gray-600">
        <Link href="/admin" className="text-sky-500/90 hover:underline">
          管理ダッシュボードへ
        </Link>
      </p>
    </main>
  );
}
