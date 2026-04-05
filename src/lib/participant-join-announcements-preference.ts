/**
 * マイページ「参加者の入室・退室の効果音」。同一ブラウザで入退室を繰り返しても保持する。
 * 入室・退出のチャット文言は常に表示（この設定は音のみ）。
 * キー名は以前の「入室表示」版から据え置き（オフ済みユーザーは引き続き無音）。
 */
export const JOIN_ENTRY_CHIME_STORAGE_KEY = 'mc_show_participant_join_announcements:v1';

export function readJoinEntryChimeEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = window.localStorage.getItem(JOIN_ENTRY_CHIME_STORAGE_KEY);
    if (v === '0') return false;
    return true;
  } catch {
    return true;
  }
}

export function writeJoinEntryChimeEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(JOIN_ENTRY_CHIME_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // noop
  }
}
