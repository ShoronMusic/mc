export type AiEnginePhase = 'phase1_external_llm' | 'phase2_hybrid' | 'phase3_custom_llm';

export type UrlSelectionPolicy = 'search_result_only';

export type AiCharacterMvpSpec = {
  phase: 'phase1_external_llm';
  characterId: string;
  characterRole: string;
  enableChatParticipation: boolean;
  enableSongSuggestion: boolean;
  maxAutoRepliesPer10Min: number;
  minReplyCooldownSec: number;
  allowDirectUrlGeneration: boolean;
  urlSelectionPolicy: UrlSelectionPolicy;
  includeFeedbackSignals: boolean;
  moderationGuardEnabled: boolean;
};

/**
 * フェーズ1の固定MVP要件。
 * - 1キャラのみ
 * - 会話参加はクールダウン必須
 * - URLは検索結果の videoId 由来のみ許可
 */
export const PHASE1_MVP_SPEC: AiCharacterMvpSpec = {
  phase: 'phase1_external_llm',
  characterId: 'hype_companion_v1',
  characterRole: '盛り上げ役',
  enableChatParticipation: true,
  enableSongSuggestion: true,
  maxAutoRepliesPer10Min: 4,
  minReplyCooldownSec: 90,
  allowDirectUrlGeneration: false,
  urlSelectionPolicy: 'search_result_only',
  includeFeedbackSignals: true,
  moderationGuardEnabled: true,
};

export type Phase1ObservedMetrics = {
  conversationContinuationRate: number;
  suggestionAdoptionRate: number;
  negativeFeedbackRate: number;
  costPerActiveRoomJpy: number;
};

export type Phase1GateThresholds = {
  minConversationContinuationRate: number;
  minSuggestionAdoptionRate: number;
  maxNegativeFeedbackRate: number;
  maxCostPerActiveRoomJpy: number;
};

export const PHASE1_DEFAULT_GATES: Phase1GateThresholds = {
  minConversationContinuationRate: 0.6,
  minSuggestionAdoptionRate: 0.18,
  maxNegativeFeedbackRate: 0.2,
  maxCostPerActiveRoomJpy: 45,
};

export type GateCheckResult = {
  passed: boolean;
  failedReasons: string[];
};

export function evaluatePhase1GoNoGo(
  observed: Phase1ObservedMetrics,
  gates: Phase1GateThresholds = PHASE1_DEFAULT_GATES,
): GateCheckResult {
  const failedReasons: string[] = [];

  if (observed.conversationContinuationRate < gates.minConversationContinuationRate) {
    failedReasons.push('会話継続率が閾値未満です。');
  }
  if (observed.suggestionAdoptionRate < gates.minSuggestionAdoptionRate) {
    failedReasons.push('選曲提案の採用率が閾値未満です。');
  }
  if (observed.negativeFeedbackRate > gates.maxNegativeFeedbackRate) {
    failedReasons.push('ネガティブ評価率が閾値を超えています。');
  }
  if (observed.costPerActiveRoomJpy > gates.maxCostPerActiveRoomJpy) {
    failedReasons.push('アクティブルーム当たり推論コストが閾値を超えています。');
  }

  return {
    passed: failedReasons.length === 0,
    failedReasons,
  };
}

export type HybridizationItem = {
  id: 'persona_memory' | 'song_suggestion_orchestration' | 'room_context_rules';
  priority: 1 | 2 | 3;
  description: string;
};

export const PHASE2_HYBRID_PRIORITIES: HybridizationItem[] = [
  {
    id: 'persona_memory',
    priority: 1,
    description: '短期文脈+長期要約でキャラの一貫性を担保する。',
  },
  {
    id: 'song_suggestion_orchestration',
    priority: 2,
    description: '検索結果の再ランクと理由生成を自前制御する。',
  },
  {
    id: 'room_context_rules',
    priority: 3,
    description: 'ターン順・沈黙介入・発話頻度の制御を自前ルール化する。',
  },
];

export type CustomLlmReadinessInput = {
  monthlyInferenceCostJpy: number;
  externalModelPersonaFitScore: number;
  dataGovernanceReady: boolean;
  evalPipelineReady: boolean;
  failoverReady: boolean;
};

export type CustomLlmReadinessDecision = {
  shouldStartPhase3: boolean;
  reasons: string[];
};

const CUSTOM_LLM_TRIGGER_MONTHLY_COST_JPY = 250000;
const EXTERNAL_PERSONA_FIT_FLOOR = 0.7;

/**
 * フェーズ3開始判定:
 * - 外部モデルのコスト超過、または人格再現スコア不足をトリガーに候補化
 * - ただし運用準備（データ統制・評価・フェイルオーバー）が揃うまで開始しない
 */
export function evaluateCustomLlmReadiness(
  input: CustomLlmReadinessInput,
): CustomLlmReadinessDecision {
  const reasons: string[] = [];
  const triggerByCost = input.monthlyInferenceCostJpy >= CUSTOM_LLM_TRIGGER_MONTHLY_COST_JPY;
  const triggerByPersona = input.externalModelPersonaFitScore < EXTERNAL_PERSONA_FIT_FLOOR;

  if (triggerByCost) reasons.push('月間推論コストが独自化トリガー閾値を超えています。');
  if (triggerByPersona) reasons.push('外部モデルの人格再現スコアが閾値を下回っています。');

  const operationalReadiness =
    input.dataGovernanceReady && input.evalPipelineReady && input.failoverReady;

  if (!input.dataGovernanceReady) reasons.push('学習データのガバナンス準備が未完了です。');
  if (!input.evalPipelineReady) reasons.push('評価パイプライン準備が未完了です。');
  if (!input.failoverReady) reasons.push('障害時のフェイルオーバー準備が未完了です。');

  return {
    shouldStartPhase3: (triggerByCost || triggerByPersona) && operationalReadiness,
    reasons,
  };
}
