/**
 * チャットの「基準メッセージ」前後を切り出す（異議申立て・チューニング報告で共用）
 */

export const CHAT_CONVERSATION_SNAPSHOT_BEFORE = 18;
export const CHAT_CONVERSATION_SNAPSHOT_AFTER = 4;
const CHAT_CONVERSATION_SNAPSHOT_MAX = 40;

export type ChatConversationSnapshotRow = {
  displayName?: string;
  messageType: string;
  body: string;
  createdAt: string;
};

export type ChatMessageLike = {
  id: string;
  displayName?: string;
  messageType: string;
  body: string;
  createdAt: string;
};

/**
 * @param anchorMessageId 基準にするメッセージ id（そのメッセージを含むスライス）
 */
export function buildChatConversationSnapshotForAnchor(
  allMessages: ChatMessageLike[],
  anchorMessageId: string,
): ChatConversationSnapshotRow[] {
  const idx = allMessages.findIndex((m) => m.id === anchorMessageId);
  if (idx < 0) return [];
  const start = Math.max(0, idx - CHAT_CONVERSATION_SNAPSHOT_BEFORE);
  const end = Math.min(allMessages.length, idx + CHAT_CONVERSATION_SNAPSHOT_AFTER + 1);
  let slice = allMessages.slice(start, end);
  if (slice.length > CHAT_CONVERSATION_SNAPSHOT_MAX) {
    slice = slice.slice(-CHAT_CONVERSATION_SNAPSHOT_MAX);
  }
  return slice.map((m) => ({
    displayName: m.displayName,
    messageType: m.messageType,
    body: m.body,
    createdAt: m.createdAt,
  }));
}
