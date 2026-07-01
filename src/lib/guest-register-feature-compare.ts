/** ユーザー登録モーダル: ゲスト vs 登録ユーザーの機能比較（単一ソース） */

export type GuestRegisterFeatureAvailability = 'yes' | 'no' | 'trial';

export type GuestRegisterFeatureRow = {
  feature: string;
  /** 機能名の補足（任意・小さく表示） */
  detail?: string;
  guest: GuestRegisterFeatureAvailability;
  registered: GuestRegisterFeatureAvailability;
  /** 登録列の脚注（例: AI参加オン時） */
  registeredNote?: string;
};

export const GUEST_REGISTER_FEATURE_COMPARE_ROWS: GuestRegisterFeatureRow[] = [
  {
    feature: '選曲（YouTube URL）',
    guest: 'yes',
    registered: 'yes',
  },
  {
    feature: '同時視聴・チャット',
    detail: '友達招待・部屋のゲスト同士',
    guest: 'yes',
    registered: 'yes',
  },
  {
    feature: 'お気に入り・マイページ',
    guest: 'no',
    registered: 'yes',
  },
  {
    feature: 'AI 曲解説',
    guest: 'no',
    registered: 'trial',
  },
  {
    feature: '@ への質問',
    guest: 'no',
    registered: 'trial',
  },
  {
    feature: 'AI参加（交互選曲）',
    detail: 'エージェントと交代',
    guest: 'no',
    registered: 'yes',
    registeredNote: 'AI参加オン時',
  },
];

export function formatGuestRegisterFeatureAvailability(
  value: GuestRegisterFeatureAvailability,
  note?: string,
): string {
  if (value === 'yes') return note ? `○ ${note}` : '○';
  if (value === 'trial') return 'お試し';
  return '—';
}
