import test from 'node:test';
import assert from 'node:assert/strict';
import { isChatMessageVisibleToClient } from './chat-message-audience';

test('isChatMessageVisibleToClient: audienceClientId limits to one client', () => {
  assert.equal(
    isChatMessageVisibleToClient({ audienceClientId: 'a' }, 'a'),
    true,
  );
  assert.equal(
    isChatMessageVisibleToClient({ audienceClientId: 'a' }, 'b'),
    false,
  );
});

test('isChatMessageVisibleToClient: audienceExcludeClientId hides from one client', () => {
  assert.equal(
    isChatMessageVisibleToClient({ audienceExcludeClientId: 'a' }, 'a'),
    false,
  );
  assert.equal(
    isChatMessageVisibleToClient({ audienceExcludeClientId: 'a' }, 'b'),
    true,
  );
});
