import assert from 'node:assert/strict';
import { normalizeSongDeleteConfirmText } from '@/lib/admin-song-delete-confirm';

function run() {
  const a = `"I Love Rock 'N' Roll" - Joan Jett & The Blackhearts`;
  const b = `"I Love Rock 'N' Roll" - joan jett & the blackhearts`;
  assert.equal(normalizeSongDeleteConfirmText(a), normalizeSongDeleteConfirmText(b));

  const c = `"I Love Rock \u2019N\u2019 Roll" - JOAN`;
  assert.ok(normalizeSongDeleteConfirmText(c).includes("'n'"));

  console.log('admin-song-delete-confirm.unit-test: ok');
}

run();
