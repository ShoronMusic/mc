/** チャットメッセージの表示対象（1人向け／特定者以外向け） */
export type ChatMessageAudience = {
  audienceClientId?: string;
  audienceExcludeClientId?: string;
};

export function isChatMessageVisibleToClient(
  payload: ChatMessageAudience,
  myClientId: string,
): boolean {
  const me = myClientId.trim();
  const audience = payload.audienceClientId?.trim();
  if (audience && audience !== me) return false;
  const exclude = payload.audienceExcludeClientId?.trim();
  if (exclude && exclude === me) return false;
  return true;
}
