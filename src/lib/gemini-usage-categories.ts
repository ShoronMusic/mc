/**
 * Gemini 利用ログの参加者向け3分類（マイページ集計・説明用）
 * docs/room-gathering-history-and-ai-billing-project.md
 */

import type { GeminiUsageTokenSummary } from '@/lib/gemini-pricing';

export type GeminiUsageCategoryId = 'commentary' | 'at_question' | 'other';

export type GeminiUsageCategoryMeta = {
  id: GeminiUsageCategoryId;
  labelJa: string;
  shortJa: string;
  descriptionJa: string;
  /** 試算の目安（1回あたり・運用データに基づく参考値） */
  typicalCostHintJa: string;
};

export const GEMINI_USAGE_CATEGORIES: readonly GeminiUsageCategoryMeta[] = [
  {
    id: 'commentary',
    labelJa: '曲解説・選曲 AI',
    shortJa: '解説',
    descriptionJa:
      'URL 選曲後の AI 解説（基本・自由枠）、曲クイズ、「次に聴くなら」、スタイル/年代分類など。',
    typicalCostHintJa:
      '運営原価の目安: フル1曲 通常 約 ¥1.4 · 多いとき 約 ¥3.6（請求は 1クレジット／約 ¥25）',
  },
  {
    id: 'at_question',
    labelJa: '@ 質問・会話',
    shortJa: '質問',
    descriptionJa:
      '「@」での AI 返答、音楽関連の自動判定、曲検索クエリ抽出。会話を続けるほど回数が増えます。',
    typicalCostHintJa:
      '運営原価の目安: @ 1回 約 ¥0.4〜0.5（請求は 0.5クレジット／約 ¥12.5）',
  },
  {
    id: 'other',
    labelJa: 'その他',
    shortJa: '他',
    descriptionJa: 'お題講評、趣向要約など、上記以外のあなた名義の AI 呼び出し。',
    typicalCostHintJa: '運営原価の目安: 利用頻度は低め',
  },
] as const;

const COMMENTARY_CONTEXTS = new Set([
  'commentary',
  'comment_pack_base',
  'comment_pack_free_1',
  'comment_pack_free_2',
  'comment_pack_free_3',
  'comment_pack_free_4',
  'comment_pack_session_bridge',
  'commentary_copyedit',
  'song_quiz',
  'get_song_style',
  'get_song_era',
  'next_song_recommend',
  'next_song_recomend',
]);

const AT_QUESTION_CONTEXTS = new Set([
  'chat_reply',
  'question_guard_classify',
  'extract_song_search',
]);

export function geminiUsageCategoryForContext(context: string): GeminiUsageCategoryId {
  const c = context.trim();
  if (COMMENTARY_CONTEXTS.has(c) || c.startsWith('comment_pack_')) return 'commentary';
  if (AT_QUESTION_CONTEXTS.has(c)) return 'at_question';
  if (c === 'theme_playlist_comment' || c === 'user_taste_auto_profile') return 'other';
  return 'other';
}

export function emptyGeminiUsageByCategory(): Record<GeminiUsageCategoryId, GeminiUsageTokenSummary> {
  return {
    commentary: { calls: 0, promptTokens: 0, outputTokens: 0, costUsd: 0, costJpyApprox: 0 },
    at_question: { calls: 0, promptTokens: 0, outputTokens: 0, costUsd: 0, costJpyApprox: 0 },
    other: { calls: 0, promptTokens: 0, outputTokens: 0, costUsd: 0, costJpyApprox: 0 },
  };
}

export function geminiUsageCategoryMeta(id: GeminiUsageCategoryId): GeminiUsageCategoryMeta {
  return GEMINI_USAGE_CATEGORIES.find((x) => x.id === id) ?? GEMINI_USAGE_CATEGORIES[2]!;
}

/** 運営原価目安ベースの割合（0〜100）。calls がすべて 0 なら null */
export function geminiUsageCategoryCostPercents(
  byCategory: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>,
): Record<GeminiUsageCategoryId, number> | null {
  const emptyPercents = (): Record<GeminiUsageCategoryId, number> => ({
    commentary: 0,
    at_question: 0,
    other: 0,
  });

  const total = GEMINI_USAGE_CATEGORIES.reduce((s, cat) => s + byCategory[cat.id].costJpyApprox, 0);
  if (total <= 0) {
    const callTotal = GEMINI_USAGE_CATEGORIES.reduce((s, cat) => s + byCategory[cat.id].calls, 0);
    if (callTotal <= 0) return null;
    const out = emptyPercents();
    for (const cat of GEMINI_USAGE_CATEGORIES) {
      out[cat.id] = Math.round((byCategory[cat.id].calls / callTotal) * 100);
    }
    return out;
  }
  const out = emptyPercents();
  for (const cat of GEMINI_USAGE_CATEGORIES) {
    out[cat.id] = Math.round((byCategory[cat.id].costJpyApprox / total) * 100);
  }
  return out;
}
