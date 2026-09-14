/**
 * `npx tsx src/lib/music-library-urls.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  clampMusicLibraryPage,
  isMusicLibraryNavStyleSlug,
  isMusicLibraryReservedSlug,
  MUSIC_LIBRARY_PAGE_SIZE,
  MUSIC_LIBRARY_TOP_PER_STYLE,
  musicLibraryArtistHref,
  musicLibraryArtistLetterHref,
  musicLibraryArtistLetterParam,
  musicLibraryHomeHref,
  musicLibrarySongHref,
  musicLibraryStyleHref,
  musicLibraryTotalPages,
  parseMusicLibraryAutoplayIndex,
  parseMusicLibraryPageParam,
  sliceMusicLibraryPage,
  withMusicLibraryAutoplay,
  musicLibraryAdminArtistEditHref,
  musicLibraryAdminSongEditHref,
} from '@/lib/music-library-urls';
import { MUSIC8_NAV_STYLE_COLORS, music8NavStyleColor } from '@/lib/music8-catalog-slugs';

assert.equal(MUSIC_LIBRARY_PAGE_SIZE, 40);
assert.equal(MUSIC_LIBRARY_TOP_PER_STYLE, 3);
assert.equal(musicLibraryHomeHref(), '/music');
assert.equal(isMusicLibraryReservedSlug('styles'), true);
assert.equal(isMusicLibraryReservedSlug('Madonna'), false);
assert.equal(isMusicLibraryNavStyleSlug('pop'), true);
assert.equal(isMusicLibraryNavStyleSlug('jazz'), false);
assert.equal(music8NavStyleColor('pop'), MUSIC8_NAV_STYLE_COLORS.pop);
assert.equal(music8NavStyleColor('Pop'), MUSIC8_NAV_STYLE_COLORS.pop);
assert.equal(music8NavStyleColor('r&b'), MUSIC8_NAV_STYLE_COLORS.rb);
assert.equal(music8NavStyleColor(null), null);

assert.equal(parseMusicLibraryPageParam('1'), 1);
assert.equal(parseMusicLibraryPageParam('2'), 2);
assert.equal(parseMusicLibraryPageParam('0'), null);
assert.equal(parseMusicLibraryPageParam('songs'), null);
assert.equal(parseMusicLibraryPageParam(-3), null);

assert.equal(musicLibraryTotalPages(0), 1);
assert.equal(musicLibraryTotalPages(40), 1);
assert.equal(musicLibraryTotalPages(41), 2);
assert.equal(clampMusicLibraryPage(99, 41), 2);

const sliced = sliceMusicLibraryPage(['a', 'b', 'c', 'd'], 2, 2);
assert.deepEqual(sliced.items, ['c', 'd']);
assert.equal(sliced.page, 2);
assert.equal(sliced.totalPages, 2);

assert.equal(musicLibraryStyleHref('Pop', 1), '/music/styles/pop/1');
assert.equal(musicLibraryArtistHref('madonna'), '/music/madonna');
assert.equal(musicLibraryArtistHref('madonna', 2), '/music/madonna/2');
assert.equal(musicLibrarySongHref('police', 'every-breath-you-take'), '/music/police/songs/every-breath-you-take');
assert.equal(musicLibrarySongHref('styles', 'x'), null);
assert.equal(musicLibrarySongHref('', 'fragile'), null);
assert.equal(musicLibrarySongHref('sting', ''), null);

assert.equal(musicLibraryArtistLetterParam('M'), 'm');
assert.equal(musicLibraryArtistLetterParam('#'), 'other');
assert.equal(musicLibraryArtistLetterHref('B'), '/music/artists/b');
assert.equal(musicLibraryArtistLetterHref('#'), '/music/artists/other');

assert.equal(withMusicLibraryAutoplay('/music/styles/pop/2'), '/music/styles/pop/2?autoplay=1');
assert.equal(withMusicLibraryAutoplay('/music/styles/pop/2', 3), '/music/styles/pop/2?autoplay=1&i=3');
assert.deepEqual(parseMusicLibraryAutoplayIndex({ autoplay: '1', i: '4' }), { autoplay: true, index: 4 });
assert.deepEqual(parseMusicLibraryAutoplayIndex({}), { autoplay: false, index: 0 });

assert.equal(
  musicLibraryAdminSongEditHref('a1e377a4-ad68-4f77-9867-dd3b59bff3a'),
  '/admin/songs/a1e377a4-ad68-4f77-9867-dd3b59bff3a',
);
assert.equal(
  musicLibraryAdminArtistEditHref({ name: 'Orbit Culture', slug: 'orbit-culture' }),
  '/admin/library/artist?slug=orbit-culture&name=Orbit+Culture',
);

console.log('music-library-urls.unit-test: ok');
