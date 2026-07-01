/**
 * 1曲選曲フルセットの参加者向け料金目安（単一ソース）
 * 内部の原価試算にビジネスマークアップ（2割増）を載せて表示する。
 *
 * YouTube / Ably は「その他」に含め、内訳では明示しない。
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

export const SONG_SELECTION_COST_GUIDE_TITLE = '1曲選曲の料金目安（参考）';

export const SONG_SELECTION_COST_GUIDE_CONDITIONS =
  '新規AI生成・AI曲解説5本（基本1+自由4）・曲クイズ・次に聴く3曲おすすめを利用した場合の目安です。';

export const SONG_SELECTION_COST_GUIDE_FOOTNOTE =
  'クラウド AI 利用原価に2割程度を上乗せした参考料金です。現時点での請求額ではありません。【現在無料】';

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
