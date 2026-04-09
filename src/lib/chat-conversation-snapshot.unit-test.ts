import assert from 'node:assert';
import {
  buildChatConversationSnapshotForAnchor,
  CHAT_CONVERSATION_SNAPSHOT_AFTER,
  CHAT_CONVERSATION_SNAPSHOT_BEFORE,
} from './chat-conversation-snapshot';

function mk(id: string, i: number) {
  return {
    id,
    displayName: 'U',
    messageType: 'user',
    body: `b${i}`,
    createdAt: new Date(i).toISOString(),
  };
}

const before = CHAT_CONVERSATION_SNAPSHOT_BEFORE;
const after = CHAT_CONVERSATION_SNAPSHOT_AFTER;

{
  const list = Array.from({ length: before + after + 5 }, (_, i) => mk(`m${i}`, i));
  const anchor = `m${before + 2}`;
  const snap = buildChatConversationSnapshotForAnchor(list, anchor);
  const idx = list.findIndex((x) => x.id === anchor);
  assert.strictEqual(snap.length, before + after + 1);
  assert.strictEqual(snap[0].body, list[idx - before].body);
  assert.strictEqual(snap[snap.length - 1].body, list[idx + after].body);
}

{
  const list = [mk('a', 1), mk('b', 2), mk('c', 3)];
  const snap = buildChatConversationSnapshotForAnchor(list, 'b');
  assert.strictEqual(snap.length, 3);
}

{
  const snap = buildChatConversationSnapshotForAnchor([], 'x');
  assert.deepStrictEqual(snap, []);
}

console.log('chat-conversation-snapshot unit tests: OK');
