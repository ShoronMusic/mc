export const ROOM_LOBBY_MESSAGE_MAX_CHARS = 100;

/** 日本語混じりの「文字数」に近いカウント（コードポイント単位） */
export function countLobbyMessageChars(s: string): number {
  return [...s].length;
}

export function normalizeLobbyMessageInput(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\r\n/g, '\n').trim();
}
