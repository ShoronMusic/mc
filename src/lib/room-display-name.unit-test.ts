import assert from 'node:assert';
import {
  normalizeRoomDisplayName,
  resolveGuestDisplayNameForJoin,
  roomDisplayNameValidationMessage,
} from './room-display-name';

assert.strictEqual(normalizeRoomDisplayName('  桐子  '), '桐子');
assert.strictEqual(roomDisplayNameValidationMessage('。'), '表示名は2文字以上で入力してください。');
assert.strictEqual(roomDisplayNameValidationMessage('a'), '表示名は2文字以上で入力してください。');
assert.strictEqual(roomDisplayNameValidationMessage('桐子'), null);
assert.strictEqual(resolveGuestDisplayNameForJoin('ちひろ'), 'ちひろ');
assert.strictEqual(resolveGuestDisplayNameForJoin('.'), null);
console.log('room-display-name.unit-test.ts: ok');
