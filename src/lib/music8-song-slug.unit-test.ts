/**
 * `npx tsx src/lib/music8-song-slug.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  hyphenateMusic8LabelSlug,
  songTitleToMusic8Slug,
  uniquifyMusic8SongSlug,
} from '@/lib/music8-song-slug';

assert.equal(songTitleToMusic8Slug('Save Your Tears'), 'save-your-tears');
assert.equal(songTitleToMusic8Slug("Don't Start Now"), 'dont-start-now');
assert.equal(songTitleToMusic8Slug('The Hills'), 'the-hills');
assert.equal(songTitleToMusic8Slug('Rock & Roll'), 'rock-and-roll');
assert.equal(songTitleToMusic8Slug('STAY'), 'stay');
assert.equal(hyphenateMusic8LabelSlug('  Café  '), 'cafe');
assert.equal(songTitleToMusic8Slug('日本語だけ'), '');

assert.equal(uniquifyMusic8SongSlug('stay', []), 'stay');
assert.equal(uniquifyMusic8SongSlug('stay', ['stay']), 'stay-2');
assert.equal(uniquifyMusic8SongSlug('stay', ['stay', 'stay-2']), 'stay-3');
assert.equal(uniquifyMusic8SongSlug('stay', ['zedd-stay']), 'stay');
assert.equal(uniquifyMusic8SongSlug('', ['stay']), '');

console.log('music8-song-slug.unit-test: ok');
