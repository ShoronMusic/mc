import assert from 'node:assert/strict';
import test from 'node:test';
import { chatMessagesToLogRows, mergeRoomChatLogRows } from '@/lib/room-chat-log-display';
import type { ChatMessage } from '@/types/chat';

test('mergeRoomChatLogRows dedupes by clientMessageId and sorts by time', () => {
  const persisted = [
    {
      clientMessageId: 'a',
      createdAt: '2026-07-05T03:00:00.000Z',
      messageType: 'user' as const,
      displayName: 'Alice',
      body: 'hello',
    },
  ];
  const live: ChatMessage[] = [
    {
      id: 'a',
      messageType: 'user',
      displayName: 'Alice',
      body: 'hello',
      createdAt: '2026-07-05T03:00:00.000Z',
    },
    {
      id: 'b',
      messageType: 'ai',
      displayName: 'AI',
      body: 'reply',
      createdAt: '2026-07-05T03:00:01.000Z',
    },
  ];
  const merged = mergeRoomChatLogRows(persisted, chatMessagesToLogRows(live));
  assert.equal(merged.length, 2);
  assert.equal(merged[1]?.body, 'reply');
});
