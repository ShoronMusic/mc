import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKnownCoverOriginalHint,
  factsBlockHasCoverOriginalSignal,
} from '@/lib/cover-original-hints';

test('buildKnownCoverOriginalHint returns Wham hint for Last Christmas covers', () => {
  const hint = buildKnownCoverOriginalHint({
    songTitle: 'Last Christmas',
    artistName: 'Music Travel Love',
  });
  assert.match(hint, /Wham!/);
  assert.match(hint, /カバー版/);
});

test('buildKnownCoverOriginalHint does not mark original artist as cover', () => {
  const hint = buildKnownCoverOriginalHint({
    songTitle: 'Last Christmas',
    artistName: 'Wham!',
  });
  assert.equal(hint, '');
});

test('factsBlockHasCoverOriginalSignal only trusts explicit cover recording kind', () => {
  assert.equal(factsBlockHasCoverOriginalSignal('・録音種別: カバー'), true);
  assert.equal(factsBlockHasCoverOriginalSignal('・原曲: Wham!（1984年）'), false);
});
