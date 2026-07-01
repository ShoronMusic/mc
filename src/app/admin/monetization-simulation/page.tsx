import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import {
  MONETIZATION_FIXED_COST_PRESETS,
  MONETIZATION_PAYMENT_NET_MULTIPLIER,
  MONETIZATION_PRICING_PLAN_CANDIDATES,
  MONETIZATION_R_BASELINE,
  MONETIZATION_R_STRESS,
  MONETIZATION_SCENARIO_A_LEGACY_ROWS,
  MONETIZATION_SCENARIO_A_REVISED_ROWS,
  MONETIZATION_SONGS_PER_USER_MONTH,
  MONETIZATION_VARIABLE_DB_SONG_JPY,
  MONETIZATION_VARIABLE_NEW_SONG_JPY,
  buildMonetizationSimulationRows,
  monetizationBreakEvenPaidUu,
  monetizationMarginalProfitPerUserJpy,
  monetizationVariablePerUserMonthJpy,
  sumMonetizationSimulationRows,
} from '@/lib/monetization-simulation-assumptions';

const MONTHLY_PRICE_JPY = 1000;
const VAR_PER_USER = monetizationVariablePerUserMonthJpy(MONETIZATION_R_BASELINE);
const MARGINAL_PER_USER = monetizationMarginalProfitPerUserJpy(MONTHLY_PRICE_JPY, MONETIZATION_R_BASELINE);

const LEGACY_ROWS = buildMonetizationSimulationRows({
  growthRows: MONETIZATION_SCENARIO_A_LEGACY_ROWS,
  fixedMonthlyJpy: 45_000,
  monthlyPriceJpy: MONTHLY_PRICE_JPY,
  r: MONETIZATION_R_BASELINE,
});
const LEGACY_TOTALS = sumMonetizationSimulationRows(LEGACY_ROWS);

const REVISED_PRESET = MONETIZATION_FIXED_COST_PRESETS.find((p) => p.id === 'C')!;
const REVISED_ROWS = buildMonetizationSimulationRows({
  growthRows: MONETIZATION_SCENARIO_A_REVISED_ROWS,
  fixedMonthlyJpy: REVISED_PRESET.monthlyJpy,
  monthlyPriceJpy: MONTHLY_PRICE_JPY,
  r: MONETIZATION_R_BASELINE,
});
const REVISED_TOTALS = sumMonetizationSimulationRows(REVISED_ROWS);

function formatSignedYen(n: number): string {
  if (n > 0) return `+${n.toLocaleString('ja-JP')}円`;
  if (n < 0) return `−${Math.abs(n).toLocaleString('ja-JP')}円`;
  return `0円`;
}

function formatYenPlain(n: number): string {
  return `${n.toLocaleString('ja-JP')}円`;
}

function SimulationTable({
  rows,
  totals,
  varPerUser,
  caption,
}: {
  rows: ReturnType<typeof buildMonetizationSimulationRows>;
  totals: ReturnType<typeof sumMonetizationSimulationRows>;
  varPerUser: number;
  caption: string;
}) {
  return (
    <figure>
      <figcaption className="mb-2 text-xs text-gray-500">{caption}</figcaption>
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="min-w-[52rem] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-950/80">
              <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                月
              </th>
              <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                期末有料UU
              </th>
              <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                MRR
              </th>
              <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                手取り
              </th>
              <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                変動（×{varPerUser}）
              </th>
              <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                固定費
              </th>
              <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                月次損益
              </th>
              <th scope="col" className="px-3 py-3 font-medium text-gray-300">
                累積
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.monthKey} className="border-b border-gray-800/90 odd:bg-gray-900/30 even:bg-gray-900/10">
                <th scope="row" className="whitespace-nowrap px-3 py-2.5 font-medium text-gray-200">
                  <span className="text-amber-200/90">{row.monthKey}</span>
                  <span className="ml-2 hidden font-normal text-gray-500 sm:inline">({row.monthLabel})</span>
                </th>
                <td className="px-3 py-2.5 tabular-nums">{row.paidUu}人</td>
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
                    row.cumProfit >= 0 ? 'text-emerald-200/90' : 'text-rose-200/90'
                  }`}
                >
                  {formatSignedYen(row.cumProfit)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-700 bg-gray-950/70 font-medium">
              <th scope="row" className="px-3 py-3 text-amber-200/90">
                計
              </th>
              <td className="px-3 py-3 text-gray-500">—</td>
              <td className="px-3 py-3 tabular-nums">{formatYenPlain(totals.revenue)}</td>
              <td className="px-3 py-3 tabular-nums">{formatYenPlain(totals.netAfterFee)}</td>
              <td className="px-3 py-3 tabular-nums text-gray-400">{formatYenPlain(totals.variable)}</td>
              <td className="px-3 py-3 tabular-nums text-gray-400">{formatYenPlain(totals.fixed)}</td>
              <td className="px-3 py-3 tabular-nums text-emerald-300/95">{formatSignedYen(totals.monthlyProfit)}</td>
              <td className="px-3 py-3 text-gray-500">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export default function AdminMonetizationSimulationPage() {
  const breakEvenRows = MONETIZATION_FIXED_COST_PRESETS.map((preset) => ({
    preset,
    breakEvenUu: monetizationBreakEvenPaidUu(preset.monthlyJpy, MONTHLY_PRICE_JPY, MONETIZATION_R_BASELINE),
    breakEvenStress: monetizationBreakEvenPaidUu(preset.monthlyJpy, MONTHLY_PRICE_JPY, MONETIZATION_R_STRESS),
  }));

  const planCompareRows = [
    { label: '月1,000円・300曲', price: 1000, songs: 300 },
    { label: '月1,500円・200曲', price: 1500, songs: 200 },
  ].map((plan) => ({
    ...plan,
    varPerUser: monetizationVariablePerUserMonthJpy(MONETIZATION_R_BASELINE, plan.songs),
    marginal: monetizationMarginalProfitPerUserJpy(plan.price, MONETIZATION_R_BASELINE, plan.songs),
    breakEvenC: monetizationBreakEvenPaidUu(REVISED_PRESET.monthlyJpy, plan.price, MONETIZATION_R_BASELINE, plan.songs),
  }));

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />

      <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        収支シミュレーション（案）
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
        正本:{' '}
        <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-amber-100/90">
          docs/monetization-options.md
        </code>
        ・計算:{' '}
        <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-amber-100/90">
          src/lib/monetization-simulation-assumptions.ts
        </code>
        。2026-06 時点で <strong className="text-gray-200">Vercel Pro 移行</strong>と{' '}
        <strong className="text-gray-200">有料化未開始</strong>を踏まえ見直し。
      </p>

      <section
        className="mt-8 rounded-xl border border-sky-900/50 bg-sky-950/20 p-5 sm:p-6"
        aria-labelledby="review-heading"
      >
        <h2 id="review-heading" className="text-lg font-semibold text-sky-200/95">
          2026-06 見直しサマリー
        </h2>
        <ul className="mt-4 list-inside list-disc space-y-2 text-sm leading-relaxed text-gray-300">
          <li>
            旧シナリオAは固定費 <strong className="text-gray-100">¥45,000/月</strong>（運用バッファ込み）と{' '}
            <strong className="text-gray-100">2026-05 有料開始</strong>が前提。現時点では有料化未実装のためタイムラインは実績とずれている。
          </li>
          <li>
            <strong className="text-gray-100">Vercel Pro 移行</strong>後のインフラ下限はパターン{' '}
            <strong className="text-gray-100">B 約¥7,500</strong> または Ably 基準込み{' '}
            <strong className="text-gray-100">C 約¥12,100</strong>（超過従量は別）。損益分岐 UU は{' '}
            <strong className="text-gray-100">約11〜17人</strong>（月1,000円・r=0.30）まで下がる。
          </li>
          <li>
            変動費 <strong className="text-gray-100">228円/人・月</strong>（300曲フル・r=0.30）は Phase 3 原価試算と整合。参加者向け表示の「1曲約¥1.4」は{' '}
            <strong className="text-gray-100">Gemini バンドルの参考料金（+2割）</strong>であり、請求単価ではない。
          </li>
          <li>
            料金形態は <strong className="text-gray-100">月額サブスク</strong>・{' '}
            <strong className="text-gray-100">プリペイドクレジット</strong>・{' '}
            <strong className="text-gray-100">上限タイトなサブスク</strong>を並行検討。実装前に管理画面の原価集計（
            <Link href="/admin/room-cost-summary" className="text-sky-400 hover:underline">
              部屋原価
            </Link>
            ・
            <Link href="/admin/user-billing-usage" className="text-sky-400 hover:underline">
              ユーザー別
            </Link>
            ）で <code className="text-xs">r</code> を実測更新すること。
          </li>
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="fixed-tier-heading">
        <h2 id="fixed-tier-heading" className="text-lg font-semibold text-amber-200/95">
          固定費ティアと損益分岐（月1,000円・300曲・r=0.30）
        </h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-800">
          <table className="min-w-[40rem] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-950/80">
                <th className="px-3 py-3 font-medium text-gray-300">パターン</th>
                <th className="px-3 py-3 font-medium text-gray-300">月次固定</th>
                <th className="px-3 py-3 font-medium text-gray-300">分岐 UU（r=0.30）</th>
                <th className="px-3 py-3 font-medium text-gray-300">分岐 UU（r=1.0 最重）</th>
                <th className="px-3 py-3 font-medium text-gray-300">メモ</th>
              </tr>
            </thead>
            <tbody>
              {breakEvenRows.map(({ preset, breakEvenUu, breakEvenStress }) => (
                <tr key={preset.id} className="border-b border-gray-800/90 odd:bg-gray-900/30">
                  <td className="px-3 py-2.5 font-medium text-gray-200">
                    {preset.id}: {preset.labelJa}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{formatYenPlain(preset.monthlyJpy)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-emerald-200/90">
                    {Number.isFinite(breakEvenUu) ? `${breakEvenUu}人` : '—'}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-amber-200/90">
                    {Number.isFinite(breakEvenStress) ? `${breakEvenStress}人` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{preset.descriptionJa}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="plan-heading">
        <h2 id="plan-heading" className="text-lg font-semibold text-amber-200/95">
          料金形態候補（比較）
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-gray-400">
          {MONETIZATION_PRICING_PLAN_CANDIDATES.map((c) => (
            <li key={c.id} className="rounded-lg border border-gray-800/80 bg-gray-950/40 p-3">
              <span className="font-medium text-gray-200">{c.labelJa}</span>
              {c.monthlyPriceJpy > 0 ? (
                <span className="ml-2 text-gray-500">
                  {formatYenPlain(c.monthlyPriceJpy)}/月 · 上限 {c.songsPerMonth}曲
                </span>
              ) : null}
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{c.noteJa}</p>
            </li>
          ))}
        </ul>
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-800">
          <table className="min-w-[36rem] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-950/80">
                <th className="px-3 py-3 font-medium text-gray-300">案</th>
                <th className="px-3 py-3 font-medium text-gray-300">1人・月 変動費</th>
                <th className="px-3 py-3 font-medium text-gray-300">限界利益</th>
                <th className="px-3 py-3 font-medium text-gray-300">分岐 UU（固定C）</th>
              </tr>
            </thead>
            <tbody>
              {planCompareRows.map((row) => (
                <tr key={row.label} className="border-b border-gray-800/90 odd:bg-gray-900/30">
                  <td className="px-3 py-2.5 text-gray-200">{row.label}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatYenPlain(row.varPerUser)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-emerald-200/90">{formatYenPlain(row.marginal)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.breakEvenC}人</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="revised-heading">
        <h2 id="revised-heading" className="text-lg font-semibold text-emerald-200/95">
          改訂シナリオ A&apos;（推奨試算）
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          有料化開始を <strong className="text-gray-200">2026-07</strong>（Vercel Pro 移行後）とし、固定費は{' '}
          <strong className="text-gray-200">{REVISED_PRESET.labelJa}</strong>（{formatYenPlain(REVISED_PRESET.monthlyJpy)}
          ）。毎月 +50人で 12 月末 300 人。プランは月1,000円・300曲・r=0.30。
        </p>
        <div className="mt-4">
          <SimulationTable
            rows={REVISED_ROWS}
            totals={REVISED_TOTALS}
            varPerUser={VAR_PER_USER}
            caption="改訂 A' — 7〜12月"
          />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          6か月合計損益 {formatSignedYen(REVISED_TOTALS.monthlyProfit)}。固定Cでは{' '}
          <strong className="text-gray-400">初月（UU 50）から月次黒字</strong>（旧 A は固定 ¥45,000 のため 5 月は赤字）。
        </p>
      </section>

      <section className="mt-10" aria-labelledby="legacy-heading">
        <h2 id="legacy-heading" className="text-lg font-semibold text-gray-400">
          旧シナリオ A（アーカイブ・2026-05〜10）
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          固定 ¥45,000・5月開始の当初案。数値は lib から再計算（旧管理画面と一致）。
        </p>
        <div className="mt-4 opacity-90">
          <SimulationTable
            rows={LEGACY_ROWS}
            totals={LEGACY_TOTALS}
            varPerUser={VAR_PER_USER}
            caption="旧 A — 参考保管"
          />
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-gray-800 bg-gray-900/50 p-5" aria-labelledby="conditions-heading">
        <h2 id="conditions-heading" className="text-lg font-semibold text-amber-200/95">
          共通の諸条件
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-gray-800/80 bg-gray-950/40 p-3">
            <dt className="font-medium text-gray-300">変動費（1曲）</dt>
            <dd className="mt-1 text-gray-400">
              NEW極 {MONETIZATION_VARIABLE_NEW_SONG_JPY}円 / DB極 {MONETIZATION_VARIABLE_DB_SONG_JPY}円
            </dd>
          </div>
          <div className="rounded-lg border border-gray-800/80 bg-gray-950/40 p-3">
            <dt className="font-medium text-gray-300">r=0.30 時</dt>
            <dd className="mt-1 text-gray-400">
              1人・月 変動 {formatYenPlain(VAR_PER_USER)} · 限界利益 {formatYenPlain(MARGINAL_PER_USER)}
            </dd>
          </div>
          <div className="rounded-lg border border-gray-800/80 bg-gray-950/40 p-3">
            <dt className="font-medium text-gray-300">決済</dt>
            <dd className="mt-1 text-gray-400">
              手数料 3.6%（×{MONETIZATION_PAYMENT_NET_MULTIPLIER}）· 上限 {MONETIZATION_SONGS_PER_USER_MONTH}曲/月フル利用
            </dd>
          </div>
          <div className="rounded-lg border border-gray-800/80 bg-gray-950/40 p-3 sm:col-span-2">
            <dt className="font-medium text-gray-300">簡式</dt>
            <dd className="mt-1 font-mono text-xs text-gray-400">
              月次損益 ≈ 期末UU × {MARGINAL_PER_USER} − 固定費
            </dd>
          </div>
        </dl>
      </section>

      <p className="mt-8 text-center text-xs text-gray-600">
        <Link href="/admin/room-cost-summary" className="text-sky-500/90 hover:underline">
          部屋原価サマリー
        </Link>
        {' · '}
        <Link href="/admin" className="text-sky-500/90 hover:underline">
          管理ダッシュボード
        </Link>
      </p>
    </main>
  );
}
