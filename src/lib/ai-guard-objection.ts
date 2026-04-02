/**
 * AI 質問ガード警告に対する異議申立て（理由キー・検証）
 */

export const AI_GUARD_OBJECTION_REASON_OPTIONS = [
  {
    id: 'music_related',
    label: '音楽（洋楽・アーティスト・曲名など）に関する質問だった',
  },
  {
    id: 'contextual',
    label: '直前の会話（選曲・曲解説など）と結びついた質問だった',
  },
  {
    id: 'short_or_pun',
    label: '短い文・語呂などで誤判定された可能性がある',
  },
  {
    id: 'other',
    label: 'その他（下のコメント欄で詳しく）',
  },
] as const;

const REASON_ID_SET = new Set<string>(AI_GUARD_OBJECTION_REASON_OPTIONS.map((o) => o.id));

export function isValidAiGuardObjectionReasonIds(ids: unknown): ids is string[] {
  if (!Array.isArray(ids) || ids.length === 0) return false;
  if (ids.length > AI_GUARD_OBJECTION_REASON_OPTIONS.length) return false;
  const seen = new Set<string>();
  for (const x of ids) {
    if (typeof x !== 'string' || !REASON_ID_SET.has(x) || seen.has(x)) return false;
    seen.add(x);
  }
  return true;
}
