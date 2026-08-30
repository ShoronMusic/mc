/**
 * Gemini 利用ログの課金帰属（billing_kind）。
 * 仕様: docs/room-gathering-history-and-ai-billing-project.md
 */

export type GeminiUsageBillingKind =
  | 'participant_user'
  | 'guest_enjoy_owner_paid'
  | 'room_owner'
  | 'ai_agent';

export type GeminiUsageAttributionRule = {
  billingKind: GeminiUsageBillingKind;
  /** 管理画面・開発者向け短い説明 */
  descriptionJa: string;
};

/** context（gemini_usage_logs.context）→ 既定の帰属 */
const RULES: Record<string, GeminiUsageAttributionRule> = {
  chat_reply: {
    billingKind: 'participant_user',
    descriptionJa: '「@」AI 返答（質問者）',
  },
  question_guard_classify: {
    billingKind: 'participant_user',
    descriptionJa: '質問ガード分類（質問者）',
  },
  extract_song_search: {
    billingKind: 'participant_user',
    descriptionJa: '曲検索クエリ抽出（依頼者）',
  },
  commentary: {
    billingKind: 'participant_user',
    descriptionJa: '曲解説（選曲者）',
  },
  comment_pack_base: {
    billingKind: 'participant_user',
    descriptionJa: 'comment-pack 基本（選曲者）',
  },
  comment_pack_free_1: {
    billingKind: 'participant_user',
    descriptionJa: 'comment-pack 自由1（選曲者）',
  },
  comment_pack_free_2: {
    billingKind: 'participant_user',
    descriptionJa: 'comment-pack 自由2（選曲者）',
  },
  comment_pack_free_3: {
    billingKind: 'participant_user',
    descriptionJa: 'comment-pack 自由3（選曲者）',
  },
  comment_pack_free_4: {
    billingKind: 'participant_user',
    descriptionJa: 'comment-pack 自由4（選曲者）',
  },
  comment_pack_session_bridge: {
    billingKind: 'participant_user',
    descriptionJa: 'comment-pack 会話つなぎ（選曲者）',
  },
  commentary_copyedit: {
    billingKind: 'participant_user',
    descriptionJa: 'Gemma曲解説の清書抽出（選曲者）',
  },
  song_quiz: {
    billingKind: 'participant_user',
    descriptionJa: '曲解説後クイズ（選曲者）',
  },
  get_song_style: {
    billingKind: 'participant_user',
    descriptionJa: 'スタイル分類（選曲に付随）',
  },
  get_song_era: {
    billingKind: 'participant_user',
    descriptionJa: '年代分類（選曲に付随）',
  },
  theme_playlist_comment: {
    billingKind: 'participant_user',
    descriptionJa: 'お題 AI 講評（選曲者）',
  },
  next_song_recommend: {
    billingKind: 'participant_user',
    descriptionJa: '次に聴くなら（試験・依頼者）',
  },
  liked_song_axis_explore: {
    billingKind: 'room_owner',
    descriptionJa: '気に入り軸ラボ（管理）',
  },
  next_song_recomend: {
    billingKind: 'participant_user',
    descriptionJa: '次に聴くなら（旧キー）',
  },
  user_taste_auto_profile: {
    billingKind: 'participant_user',
    descriptionJa: 'マイページ・趣向自動要約（本人）',
  },
  tidbit: {
    billingKind: 'room_owner',
    descriptionJa: '豆知識（部屋共通・主催者原価）',
  },
  character_song_pick: {
    billingKind: 'ai_agent',
    descriptionJa: 'AI エージェント選曲（主催者原価）',
  },
};

const DEFAULT_RULE: GeminiUsageAttributionRule = {
  billingKind: 'room_owner',
  descriptionJa: '未分類（部屋共通・主催者原価）',
};

export function getGeminiUsageAttributionRule(context: string): GeminiUsageAttributionRule {
  return RULES[context] ?? DEFAULT_RULE;
}

export function resolveGeminiUsageBillingKind(
  context: string,
  opts?: {
    billingKind?: GeminiUsageBillingKind | null;
    isGuestTrigger?: boolean;
  },
): GeminiUsageBillingKind {
  const base = opts?.billingKind ?? getGeminiUsageAttributionRule(context).billingKind;
  if (
    opts?.isGuestTrigger &&
    base === 'participant_user'
  ) {
    return 'guest_enjoy_owner_paid';
  }
  return base;
}

/** billing_user_id を決める（主催者 ID は呼び出し側で fetch して渡す） */
export function resolveGeminiBillingUserId(params: {
  billingKind: GeminiUsageBillingKind;
  triggerUserId?: string | null;
  ownerUserId?: string | null;
  explicitBillingUserId?: string | null;
}): string | null {
  if (params.explicitBillingUserId?.trim()) return params.explicitBillingUserId.trim();
  const trigger = params.triggerUserId?.trim() || null;
  const owner = params.ownerUserId?.trim() || null;
  switch (params.billingKind) {
    case 'participant_user':
      return trigger;
    case 'guest_enjoy_owner_paid':
    case 'room_owner':
    case 'ai_agent':
      return owner;
    default:
      return null;
  }
}
