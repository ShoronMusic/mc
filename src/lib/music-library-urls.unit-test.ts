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
  musicLibraryArtistsHref,
  parseMusicLibraryArtistSearchQuery,
  isMusicLibraryGenreLetterSegment,
  musicLibraryGenreHref,
  musicLibraryGenreLetterHref,
  musicLibraryGenresHref,
  musicLibraryGenreBestHref,
  musicLibraryGenreBestDetailHref,
  musicLibraryChartsHref,
  musicLibraryWeeklyChartHref,
} from '@/lib/music-library-urls';
import { MUSIC8_NAV_STYLE_COLORS, music8NavStyleColor } from '@/lib/music8-catalog-slugs';

assert.equal(MUSIC_LIBRARY_PAGE_SIZE, 40);
assert.equal(MUSIC_LIBRARY_TOP_PER_STYLE, 3);
assert.equal(musicLibraryHomeHref(), '/music');
assert.equal(isMusicLibraryReservedSlug('styles'), true);
assert.equal(isMusicLibraryReservedSlug('charts'), true);
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
assert.equal(musicLibraryArtistLetterParam('9'), '0-9');
assert.equal(musicLibraryArtistLetterParam('0-9'), '0-9');
assert.equal(musicLibraryArtistLetterHref('B'), '/music/artists/b');
assert.equal(musicLibraryArtistLetterHref('#'), '/music/artists/other');
assert.equal(musicLibraryArtistLetterHref('9'), '/music/artists/0-9');
assert.equal(musicLibraryArtistLetterHref('0-9', 2), '/music/artists/0-9/2');
assert.equal(musicLibraryArtistLetterHref('a', 2), '/music/artists/a/2');
assert.equal(
  musicLibraryArtistLetterHref('a', 1, { sort: 'active', dir: 'desc' }),
  '/music/artists/a?sort=active',
);

assert.equal(parseMusicLibraryArtistSearchQuery('  grimes  '), 'grimes');
assert.equal(parseMusicLibraryArtistSearchQuery(''), '');
assert.equal(musicLibraryArtistsHref(), '/music/artists');
assert.equal(musicLibraryArtistsHref({ q: '  ' }), '/music/artists');
assert.equal(musicLibraryArtistsHref({ q: 'grimes' }), '/music/artists?q=grimes');
assert.equal(musicLibraryArtistsHref({ q: 'grimes', page: 2 }), '/music/artists?q=grimes&page=2');
assert.equal(
  musicLibraryArtistsHref({ q: 'grimes', sort: 'abc', dir: 'asc' }),
  '/music/artists?q=grimes&sort=abc',
);
assert.equal(musicLibraryArtistsHref({ q: 'grimes', sort: 'songs', dir: 'desc' }), '/music/artists?q=grimes');

assert.equal(isMusicLibraryGenreLetterSegment('b'), true);
assert.equal(isMusicLibraryGenreLetterSegment('other'), true);
assert.equal(isMusicLibraryGenreLetterSegment('0-9'), true);
assert.equal(isMusicLibraryGenreLetterSegment('britpop'), false);
assert.equal(musicLibraryGenresHref(), '/music/genres');
assert.equal(musicLibraryGenresHref({ q: 'britpop' }), '/music/genres?q=britpop');
assert.equal(musicLibraryGenreLetterHref('B'), '/music/genres/b');
assert.equal(musicLibraryGenreLetterHref('a', 2), '/music/genres/a/2');
assert.equal(musicLibraryGenreLetterHref('2'), '/music/genres/0-9');
assert.equal(musicLibraryGenreLetterHref('0-9', 2), '/music/genres/0-9/2');
assert.equal(musicLibraryGenreHref('Britpop', 1), '/music/genres/britpop/1');
assert.equal(musicLibraryGenreHref('synth-pop', 2), '/music/genres/synth-pop/2');
assert.equal(musicLibraryGenreHref('2-step', 1), '/music/genres/2-step/1');

assert.equal(musicLibraryGenreBestHref(), '/music/genre-best');
assert.equal(musicLibraryGenreBestHref('pop'), '/music/genre-best?tab=pop');
assert.equal(musicLibraryGenreBestDetailHref('disco', 1), '/music/genre-best/disco/1');
assert.equal(musicLibraryGenreBestDetailHref('synth-pop', 2), '/music/genre-best/synth-pop/2');

assert.equal(isMusicLibraryReservedSlug('charts'), true);
assert.equal(musicLibraryChartsHref(), '/music/charts');
assert.equal(musicLibraryWeeklyChartHref('us'), '/music/charts/us');
assert.equal(musicLibraryWeeklyChartHref('uk'), '/music/charts/uk');

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
