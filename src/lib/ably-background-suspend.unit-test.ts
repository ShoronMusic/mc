import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDocumentHiddenState,
  shouldSuspendAblyForHidden,
} from './ably-background-suspend';

test('isDocumentHiddenState', () => {
  assert.equal(isDocumentHiddenState('hidden'), true);
  assert.equal(isDocumentHiddenState('visible'), false);
});

test('shouldSuspendAblyForHidden: false when not hidden', () => {
  assert.equal(shouldSuspendAblyForHidden(null, 1000, 30_000), false);
});

test('shouldSuspendAblyForHidden: false before threshold', () => {
  assert.equal(shouldSuspendAblyForHidden(1000, 20_000, 30_000), false);
});

test('shouldSuspendAblyForHidden: true at threshold', () => {
  assert.equal(shouldSuspendAblyForHidden(1000, 31_000, 30_000), true);
});
