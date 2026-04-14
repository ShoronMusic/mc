import assert from 'node:assert/strict';
import {
  canonicalCommentPackSlots,
  commentPackSlotsEqual,
  COMMENT_PACK_SLOTS_FULL,
  DEFAULT_COMMENT_PACK_SLOTS,
  equivalentBaseOnlySlots,
  isCommentPackFullyOff,
  normalizeCommentPackSlotsFromRequestBody,
  parseCommentPackSlotsFromStorageRaw,
  parseOptionalFreeSlotIndex,
} from './comment-pack-slots';

assert.equal(isCommentPackFullyOff([false, false, false, false]), true);
assert.equal(equivalentBaseOnlySlots([true, false, false, false]), true);
assert.deepEqual(
  normalizeCommentPackSlotsFromRequestBody({ mode: 'full' }),
  [true, true, true, true],
);
assert.deepEqual(
  normalizeCommentPackSlotsFromRequestBody({ slots: [true, false, true, false] }),
  [true, false, true, false],
);
assert.deepEqual(parseCommentPackSlotsFromStorageRaw('base_only'), [true, false, false, false]);
assert.deepEqual(
  parseCommentPackSlotsFromStorageRaw('[true,false,true,true]'),
  [true, false, true, true],
);
assert.deepEqual(
  parseCommentPackSlotsFromStorageRaw(JSON.stringify(DEFAULT_COMMENT_PACK_SLOTS)),
  DEFAULT_COMMENT_PACK_SLOTS,
);

assert.equal(commentPackSlotsEqual([true, true, true, true], COMMENT_PACK_SLOTS_FULL), true);
assert.equal(commentPackSlotsEqual([true, true, true, true], [true, false, false, false]), false);
assert.strictEqual(canonicalCommentPackSlots([true, true, true, true]), COMMENT_PACK_SLOTS_FULL);

assert.equal(parseOptionalFreeSlotIndex({ freeSlotIndex: 0 }), 0);
assert.equal(parseOptionalFreeSlotIndex({ freeSlotIndex: '2' }), 2);
assert.equal(parseOptionalFreeSlotIndex({ freeSlotIndex: 5 }), null);
assert.equal(parseOptionalFreeSlotIndex({ freeSlotIndex: 'x' }), null);

console.log('comment-pack-slots unit tests: OK');
