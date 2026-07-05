/** 部屋参加時の表示名（1文字「。」等で AI・順番表示が壊れるのを防ぐ） */
export const ROOM_DISPLAY_NAME_MIN_LENGTH = 2;
export const ROOM_DISPLAY_NAME_MAX_LENGTH = 32;

export function normalizeRoomDisplayName(raw: string): string {
  return raw.trim().normalize('NFKC');
}

export function roomDisplayNameValidationMessage(raw: string): string | null {
  const name = normalizeRoomDisplayName(raw);
  if (!name || name === 'ゲスト') {
    return '表示名を入力してください。';
  }
  if (name.length < ROOM_DISPLAY_NAME_MIN_LENGTH) {
    return `表示名は${ROOM_DISPLAY_NAME_MIN_LENGTH}文字以上で入力してください。`;
  }
  if (name.length > ROOM_DISPLAY_NAME_MAX_LENGTH) {
    return `表示名は${ROOM_DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください。`;
  }
  return null;
}

export function resolveGuestDisplayNameForJoin(raw: string): string | null {
  const err = roomDisplayNameValidationMessage(raw);
  if (err) return null;
  return normalizeRoomDisplayName(raw);
}
