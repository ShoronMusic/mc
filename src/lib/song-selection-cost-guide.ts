/**
 * 1曲選曲フルセットの運営側 API 原価目安（単一ソース・請求単価ではない）
 * 請求: docs/00-prepaid-pricing-summary.md · ai-credits-config.ts
 */

export type SongSelectionCostScenarioId = 'participant' | 'ai_agent';

export type SongSelectionCostScenario = {
  id: SongSelectionCostScenarioId;
  labelJa: string;
  typicalJpyLabel: string;
  highJpyLabel: string;
  /** 内訳（短いラベル列） */
  includes: readonly string[];
};

/** 表示料金 = 原価試算 × この係数（2割増） */
export const SONG_SELECTION_BUSINESS_MARKUP = 1.2;

const COST_TYPICAL_PARTICIPANT_JPY = 1.2;
const COST_HIGH_PARTICIPANT_JPY = 3;
const COST_TYPICAL_AI_AGENT_JPY = 1.5;
const COST_HIGH_AI_AGENT_JPY = 4;

export function formatSongSelectionBusinessJpyLabel(costJpy: number, highRange = false): string {
  const jpy = costJpy * SONG_SELECTION_BUSINESS_MARKUP;
  const rounded = jpy < 10 ? Math.round(jpy * 10) / 10 : Math.round(jpy);
  const suffix = highRange ? ' 前後' : '';
  return `約 ¥${rounded}${suffix}`;
}

export const SONG_SELECTION_COST_GUIDE_TITLE = '運営側のAPI原価目安（請求ではありません）';

export const SONG_SELECTION_COST_GUIDE_CONDITIONS =
  '新規AI生成・AI曲解説5本（基本1+自由4）・曲クイズ・次に聴く3曲おすすめを利用した場合の、サイト運営が負担するクラウド原価の目安です。';

export const SONG_SELECTION_COST_GUIDE_FOOTNOTE =
  '原価試算に2割程度を載せた参考値です。参加者への請求はクレジット（選曲1・@0.5）です。ここには請求単価を書いていません。【現在無料】';

export const SONG_SELECTION_COST_SCENARIOS: readonly SongSelectionCostScenario[] = [
  {
    id: 'participant',
    labelJa: 'あなたの選曲',
    typicalJpyLabel: formatSongSelectionBusinessJpyLabel(COST_TYPICAL_PARTICIPANT_JPY),
    highJpyLabel: formatSongSelectionBusinessJpyLabel(COST_HIGH_PARTICIPANT_JPY, true),
    includes: ['AI曲解説 5本', '曲クイズ', '次に聴く3曲おすすめ', 'その他'],
  },
  {
    id: 'ai_agent',
    labelJa: 'AIエージェント選曲',
    typicalJpyLabel: formatSongSelectionBusinessJpyLabel(COST_TYPICAL_AI_AGENT_JPY),
    highJpyLabel: formatSongSelectionBusinessJpyLabel(COST_HIGH_AI_AGENT_JPY, true),
    includes: ['AIエージェント選曲', 'AI曲解説 5本', '曲クイズ', '次に聴く3曲おすすめ', 'その他'],
  },
] as const;

export function formatSongSelectionCostRange(scenario: SongSelectionCostScenario): string {
  return `通常 ${scenario.typicalJpyLabel} · 多いとき ${scenario.highJpyLabel}`;
}
