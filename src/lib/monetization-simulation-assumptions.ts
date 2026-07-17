/**
 * 収支シミュレーション（管理画面・docs/monetization-options.md）の共通前提
 * 2026-06 見直し: Vercel Pro 移行に合わせ固定費をティア化
 */

/** Stripe 等の決済手数料（手取り = 売上 × この係数） */
export const MONETIZATION_PAYMENT_NET_MULTIPLIER = 0.964;

/** 1曲あたり変動費（NEW極 / DB極）— docs/monetization-options.md 暫定収支メモ */
export const MONETIZATION_VARIABLE_NEW_SONG_JPY = 1.6;
export const MONETIZATION_VARIABLE_DB_SONG_JPY = 0.4;

/** 有料プラン想定: 1人あたり月間上限曲数（フル利用ストレス試算） */
export const MONETIZATION_SONGS_PER_USER_MONTH = 300;

/** NEW級（2クレジット級）の割合 r — 基準 0.30 */
export const MONETIZATION_R_BASELINE = 0.3;
export const MONETIZATION_R_STRESS = 1.0;

export type MonetizationFixedCostPreset = {
  id: string;
  labelJa: string;
  monthlyJpy: number;
  descriptionJa: string;
};

/** 月次固定費の代表パターン（docs/monetization-options.md「代表パターン合計」） */
export const MONETIZATION_FIXED_COST_PRESETS: readonly MonetizationFixedCostPreset[] = [
  {
    id: 'B',
    labelJa: '基盤 B（Vercel Pro + Supabase Pro）',
    monthlyJpy: 7_500,
    descriptionJa:
      'Vercel Pro 約¥3,200 + Supabase Pro 約¥4,000 + ドメイン按分。Ably 無料枠内・超過従量は別。',
  },
  {
    id: 'C',
    labelJa: '基盤 C（B + Ably Standard 基準月額）',
    monthlyJpy: 12_100,
    descriptionJa: 'B に Ably $29/月相当を加えた小規模本番の下限目安。メッセージ従量は別。',
  },
  {
    id: 'D',
    labelJa: '旧シナリオ D（運用バッファ込み ¥45,000）',
    monthlyJpy: 45_000,
    descriptionJa:
      '2026-04 暫定収支メモの按分。超過・予備・その他 SaaS を含む保守的上振れ前提。Vercel Hobby 時代の試算。',
  },
] as const;

export type MonetizationPricingPlanCandidate = {
  id: string;
  labelJa: string;
  monthlyPriceJpy: number;
  songsPerMonth: number;
  noteJa: string;
};

/** 料金形態の検討候補（実装前の比較用） */
export const MONETIZATION_PRICING_PLAN_CANDIDATES: readonly MonetizationPricingPlanCandidate[] = [
  {
    id: 'sub_1000_300',
    labelJa: '月額サブスク（旧シナリオA）',
    monthlyPriceJpy: 1_000,
    songsPerMonth: 300,
    noteJa: '1曲あたり売上約¥3.3（上限フル時）。説明は簡単だがヘビーユースで原価が読みにくい。',
  },
  {
    id: 'sub_1500_200',
    labelJa: '月額サブスク（上限タイト）',
    monthlyPriceJpy: 1_500,
    songsPerMonth: 200,
    noteJa: '1曲あたり売上約¥7.5。AI 原価との余裕を広げる案。',
  },
  {
    id: 'credit_30',
    labelJa: 'プリペイド（30円/曲・500円チャージ）',
    monthlyPriceJpy: 0,
    songsPerMonth: 0,
    noteJa: '従量に近い。都度決済は手数料負けしやすいためチャージ式。docs 暫定方針と同一。',
  },
  {
    id: 'display_ref',
    labelJa: '運営原価の表示参考（1曲フル約¥1.4・請求ではない）',
    monthlyPriceJpy: 0,
    songsPerMonth: 0,
    noteJa:
      'song-selection-cost-guide の運営原価目安（原価+2割）。実請求は ¥25/曲・@0.5クレジット。',
  },
] as const;

export type MonetizationScenarioGrowthRow = {
  monthKey: string;
  monthLabel: string;
  paidUu: number;
};

/** 旧シナリオA: 2026-05〜10・毎月+50人 */
export const MONETIZATION_SCENARIO_A_LEGACY_ROWS: readonly MonetizationScenarioGrowthRow[] = [
  { monthKey: '05', monthLabel: '2026年5月', paidUu: 50 },
  { monthKey: '06', monthLabel: '2026年6月', paidUu: 100 },
  { monthKey: '07', monthLabel: '2026年7月', paidUu: 150 },
  { monthKey: '08', monthLabel: '2026年8月', paidUu: 200 },
  { monthKey: '09', monthLabel: '2026年9月', paidUu: 250 },
  { monthKey: '10', monthLabel: '2026年10月', paidUu: 300 },
] as const;

/**
 * 改訂シナリオA'（2026-07 〜）: Vercel Pro 移行後から有料化開始、12月末300人
 * 6〜10月の旧目標は未達のためタイムラインを1か月シフト
 */
export const MONETIZATION_SCENARIO_A_REVISED_ROWS: readonly MonetizationScenarioGrowthRow[] = [
  { monthKey: '07', monthLabel: '2026年7月', paidUu: 50 },
  { monthKey: '08', monthLabel: '2026年8月', paidUu: 100 },
  { monthKey: '09', monthLabel: '2026年9月', paidUu: 150 },
  { monthKey: '10', monthLabel: '2026年10月', paidUu: 200 },
  { monthKey: '11', monthLabel: '2026年11月', paidUu: 250 },
  { monthKey: '12', monthLabel: '2026年12月', paidUu: 300 },
] as const;

export function monetizationVariablePerUserMonthJpy(
  r: number,
  songsPerMonth = MONETIZATION_SONGS_PER_USER_MONTH,
): number {
  const perSong =
    r * MONETIZATION_VARIABLE_NEW_SONG_JPY + (1 - r) * MONETIZATION_VARIABLE_DB_SONG_JPY;
  return Math.round(songsPerMonth * perSong);
}

export function monetizationMarginalProfitPerUserJpy(
  monthlyPriceJpy: number,
  r: number,
  songsPerMonth = MONETIZATION_SONGS_PER_USER_MONTH,
): number {
  const net = Math.round(monthlyPriceJpy * MONETIZATION_PAYMENT_NET_MULTIPLIER);
  return net - monetizationVariablePerUserMonthJpy(r, songsPerMonth);
}

export function monetizationBreakEvenPaidUu(
  fixedMonthlyJpy: number,
  monthlyPriceJpy: number,
  r: number,
  songsPerMonth = MONETIZATION_SONGS_PER_USER_MONTH,
): number {
  const marginal = monetizationMarginalProfitPerUserJpy(monthlyPriceJpy, r, songsPerMonth);
  if (marginal <= 0) return Infinity;
  return Math.ceil(fixedMonthlyJpy / marginal);
}

export type MonetizationSimulationRow = {
  monthKey: string;
  monthLabel: string;
  paidUu: number;
  revenue: number;
  netAfterFee: number;
  variable: number;
  fixed: number;
  monthlyProfit: number;
  cumProfit: number;
};

export function buildMonetizationSimulationRows(input: {
  growthRows: readonly MonetizationScenarioGrowthRow[];
  fixedMonthlyJpy: number;
  monthlyPriceJpy: number;
  r: number;
  songsPerMonth?: number;
}): MonetizationSimulationRow[] {
  const songs = input.songsPerMonth ?? MONETIZATION_SONGS_PER_USER_MONTH;
  const varPerUser = monetizationVariablePerUserMonthJpy(input.r, songs);
  let cum = 0;
  return input.growthRows.map((g) => {
    const revenue = g.paidUu * input.monthlyPriceJpy;
    const netAfterFee = Math.round(revenue * MONETIZATION_PAYMENT_NET_MULTIPLIER);
    const variable = g.paidUu * varPerUser;
    const monthlyProfit = netAfterFee - variable - input.fixedMonthlyJpy;
    cum += monthlyProfit;
    return {
      monthKey: g.monthKey,
      monthLabel: g.monthLabel,
      paidUu: g.paidUu,
      revenue,
      netAfterFee,
      variable,
      fixed: input.fixedMonthlyJpy,
      monthlyProfit,
      cumProfit: cum,
    };
  });
}

export function sumMonetizationSimulationRows(rows: MonetizationSimulationRow[]): {
  revenue: number;
  netAfterFee: number;
  variable: number;
  fixed: number;
  monthlyProfit: number;
} {
  return rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      netAfterFee: acc.netAfterFee + row.netAfterFee,
      variable: acc.variable + row.variable,
      fixed: acc.fixed + row.fixed,
      monthlyProfit: acc.monthlyProfit + row.monthlyProfit,
    }),
    { revenue: 0, netAfterFee: 0, variable: 0, fixed: 0, monthlyProfit: 0 },
  );
}
