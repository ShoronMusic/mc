import assert from 'node:assert/strict';
import {
  buildLibraryArtistExternalLinks,
  formatLibraryArtistAgeLabel,
  formatLibraryArtistDetailTitleLines,
  formatLibraryArtistNameJaWithAge,
  formatLibraryOriginCountry,
} from '@/lib/library-artist-public-display';

assert.equal(formatLibraryOriginCountry('JPN'), 'JPN（日本）');
assert.equal(formatLibraryOriginCountry('XYZ'), 'XYZ');

const age = formatLibraryArtistAgeLabel('1991.03.10', null);
assert.ok(age && /^\d+歳$/.test(age), `expected age label, got ${age}`);

const links = buildLibraryArtistExternalLinks({
  youtube_channel_id: 'UCUCeZaZeJbEYAAzvMgrKOPQ',
  spotify_artist_id: '1snhtMLeb2DYoMOcVbb8iB',
  wikipedia_page: '米津玄師',
});
assert.ok(links.youtube?.includes('youtube.com'));
assert.ok(links.spotify?.includes('open.spotify.com'));
assert.ok(links.wikipedia?.includes('ja.wikipedia.org'));

const title = formatLibraryArtistDetailTitleLines('米津玄師', 'JPN', 1, 'Kenshi Yonezu');
assert.equal(title.primary, '米津玄師 （1曲）');
assert.equal(title.secondary, 'Kenshi Yonezu / JPN');

const titleNoEn = formatLibraryArtistDetailTitleLines('米津玄師', 'JPN', 1, null);
assert.equal(titleNoEn.primary, '米津玄師 （1曲）');
assert.equal(titleNoEn.secondary, 'JPN');
assert.equal(formatLibraryArtistNameJaWithAge('ヨネヅケンシ', '35歳'), 'ヨネヅケンシ（35歳）');

console.log('library-artist-public-display.unit-test: ok');
