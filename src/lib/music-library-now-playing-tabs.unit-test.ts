/**
 * `npx tsx src/lib/music-library-now-playing-tabs.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { musicLibraryNowPlayingArtistTabs } from '@/lib/music-library-now-playing-tabs';
import type { MusicLibraryListArtist } from '@/lib/music-library-types';

const weeknd: MusicLibraryListArtist = {
  name: 'The Weeknd',
  slug: 'weeknd',
  href: '/music/weeknd',
  originLabel: 'CAN',
};
const tomoko: MusicLibraryListArtist = {
  name: 'Tomoko Aran',
  slug: 'tomoko-aran',
  href: '/music/tomoko-aran',
  originLabel: 'JP',
};
const page = { slug: 'weeknd', name: 'The Weeknd' };

assert.deepEqual(
  musicLibraryNowPlayingArtistTabs([weeknd], page).map((a) => a.slug),
  [],
);
assert.deepEqual(
  musicLibraryNowPlayingArtistTabs([weeknd, tomoko], page).map((a) => a.slug),
  ['tomoko-aran'],
);
assert.deepEqual(
  musicLibraryNowPlayingArtistTabs([weeknd, tomoko], { slug: 'tomoko-aran', name: 'Tomoko Aran' }).map(
    (a) => a.slug,
  ),
  ['weeknd'],
);
assert.deepEqual(
  musicLibraryNowPlayingArtistTabs([weeknd, tomoko], null).map((a) => a.slug),
  ['weeknd', 'tomoko-aran'],
);
assert.deepEqual(
  musicLibraryNowPlayingArtistTabs([weeknd], { slug: 'weeknd', name: 'Weeknd' }).map((a) => a.slug),
  [],
);

console.log('music-library-now-playing-tabs.unit-test: ok');
