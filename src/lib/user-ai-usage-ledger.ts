import { formatAiCreditAmount } from '@/lib/ai-credits-config';
import type { AiCreditTransactionKind } from '@/lib/user-ai-credits-server';

export type UserAiUsageLedgerKind =
  | 'trial_grant'
  | 'trial_song'
  | 'trial_at'
  | 'grant_admin'
  | 'grant_purchase'
  | 'consume_song'
  | 'consume_at_question';

export type UserAiUsageLedgerItem = {
  id: string;
  at: string;
  kind: UserAiUsageLedgerKind;
  /** 一覧見出し */
  label: string;
  /** 増減の短い表示（例: −1曲 / +20クレジット） */
  deltaLabel: string;
  /** クレジット取引のみ。お試し消費は null */
  balanceAfterLabel: string | null;
  roomId: string | null;
  videoId: string | null;
  note: string | null;
  source: 'trial' | 'credits';
};

export function labelForAiUsageLedgerKind(kind: UserAiUsageLedgerKind): string {
  switch (kind) {
    case 'trial_grant':
      return '初期お試し付与';
    case 'trial_song':
      return 'お試し消費 AI付き選曲';
    case 'trial_at':
      return 'お試し消費 @質問';
    case 'grant_admin':
      return 'クレジット付与（管理）';
    case 'grant_purchase':
      return 'クレジット購入';
    case 'consume_song':
      return 'クレジット消費 AI付き選曲';
    case 'consume_at_question':
      return 'クレジット消費 @質問';
    default:
      return kind;
  }
}

export function deltaLabelForCreditTx(kind: AiCreditTransactionKind, delta: number): string {
  const abs = formatAiCreditAmount(Math.abs(delta));
  const sign = delta >= 0 ? '+' : '−';
  return `${sign}${abs}クレジット`;
}

export function deltaLabelForTrialSong(): string {
  return '−1曲';
}

export function deltaLabelForTrialAt(): string {
  return '−1回@';
}

export function deltaLabelForTrialGrant(songs: number, atQuestions: number): string {
  const s = Math.max(0, Math.floor(songs));
  const a = Math.max(0, Math.floor(atQuestions));
  return `+${s}曲 · +${a}回@`;
}

export function mapCreditKindToLedgerKind(kind: AiCreditTransactionKind): UserAiUsageLedgerKind {
  return kind;
}

/** 新しい順にマージ（同刻は credits → trial の順で安定） */
export function mergeAiUsageLedgerItems(
  items: UserAiUsageLedgerItem[],
  limit = 80,
): UserAiUsageLedgerItem[] {
  const sorted = [...items].sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    if (tb !== ta) return tb - ta;
    if (a.source !== b.source) return a.source === 'credits' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  return sorted.slice(0, Math.max(1, limit));
}
