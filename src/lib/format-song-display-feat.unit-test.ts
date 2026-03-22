/**
 * FEAT_SEPARATOR が曲名中の「With」を共演区切りと誤認しないことの検証。
 * `npx tsx src/lib/format-song-display-feat.unit-test.ts` / `npm run test:format`
 */
import assert from 'node:assert/strict';
import { getArtistDisplayString, getMainArtist } from './format-song-display';

assert.equal(getMainArtist('Die With A Smile'), 'Die With A Smile');
assert.equal(getArtistDisplayString('Die With A Smile'), 'Die With A Smile');

assert.equal(getMainArtist('Be With You'), 'Be With You');

assert.equal(getMainArtist('Drake ft. Rihanna'), 'Drake');
assert.equal(getArtistDisplayString('Drake ft. Rihanna'), 'Drake, Rihanna');

console.log('format-song-display feat separator unit tests: OK');
