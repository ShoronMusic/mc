export const ROOM_LOBBY_MESSAGE_MAX_CHARS = 100;
export const ROOM_DISPLAY_TITLE_MAX_CHARS = 40;

/** 日本語混じりの「文字数」に近いカウント（コードポイント単位） */
export function countLobbyMessageChars(s: string): number {
  return Array.from(s).length;
}

export function normalizeLobbyMessageInput(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\r\n/g, '\n').trim();
}

/** 部屋の表示タイトル（改行なし・前後空白除去） */
export function normalizeDisplayTitleInput(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const t = raw.replace(/\r\n/g, '').trim();
  const arr = Array.from(t);
  if (arr.length <= ROOM_DISPLAY_TITLE_MAX_CHARS) return t;
  return arr.slice(0, ROOM_DISPLAY_TITLE_MAX_CHARS).join('');
}
