import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExplicitCreditArtists,
  formatPlaylistArtistsField,
  parseCreditArtistsInput,
  parsePlaylistArtistsField,
} from './admin-domestic-playlist-artists-field';
import {
  artistNameMatchesRegisteredArtist,
  buildYoutubePlaylistUrl,
  parseYoutubePlaylistId,
  youtubeChannelIdsLooselyMatch,
} from './admin-domestic-artist-playlist';

test('parseYoutubePlaylistId from url', () => {
  assert.equal(
    parseYoutubePlaylistId('https://www.youtube.com/playlist?list=PLabc123', ''),
    'PLabc123',
  );
});

test('parseYoutubePlaylistId from raw id', () => {
  assert.equal(parseYoutubePlaylistId('', 'PLxyz'), 'PLxyz');
});

test('buildYoutubePlaylistUrl', () => {
  assert.equal(buildYoutubePlaylistUrl('PLabc'), 'https://www.youtube.com/playlist?list=PLabc');
});

test('artistNameMatchesRegisteredArtist — Japanese name', () => {
  assert.equal(
    artistNameMatchesRegisteredArtist('米津玄師', { name: '米津玄師', nameEn: 'Kenshi Yonezu' }),
    true,
  );
});

test('artistNameMatchesRegisteredArtist — English name', () => {
  assert.equal(
    artistNameMatchesRegisteredArtist('Kenshi Yonezu', {
      name: '米津玄師',
      nameEn: 'Kenshi Yonezu',
    }),
    true,
  );
});

test('artistNameMatchesRegisteredArtist — mismatch', () => {
  assert.equal(
    artistNameMatchesRegisteredArtist('Ado', { name: '米津玄師', nameEn: 'Kenshi Yonezu' }),
    false,
  );
});

test('youtubeChannelIdsLooselyMatch — 1-char typo', () => {
  assert.equal(
    youtubeChannelIdsLooselyMatch('UCUceZaZeJbEYAAzvMgrKOPQ', 'UCUCeZaZeJbEYAAzvMgrKOPQ'),
    true,
  );
  assert.equal(youtubeChannelIdsLooselyMatch('UCabc', 'UCxyz'), false);
});

test('parseCreditArtistsInput', () => {
  assert.deepEqual(parseCreditArtistsInput('宇多田ヒカル'), ['宇多田ヒカル']);
  assert.deepEqual(parseCreditArtistsInput('宇多田ヒカル, 米津玄師'), ['宇多田ヒカル', '米津玄師']);
});

test('buildExplicitCreditArtists dedupes main', () => {
  assert.deepEqual(buildExplicitCreditArtists('米津玄師', ['宇多田ヒカル', '米津玄師']), [
    '米津玄師',
    '宇多田ヒカル',
  ]);
});

test('parsePlaylistArtistsField — main + credits', () => {
  assert.deepEqual(parsePlaylistArtistsField('米津玄師, 宇多田ヒカル'), {
    mainArtist: '米津玄師',
    creditArtists: ['宇多田ヒカル'],
  });
});

test('formatPlaylistArtistsField', () => {
  assert.equal(formatPlaylistArtistsField('米津玄師', ['宇多田ヒカル']), '米津玄師, 宇多田ヒカル');
});
