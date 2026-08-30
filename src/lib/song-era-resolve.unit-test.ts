import assert from 'node:assert/strict';
import test from 'node:test';

import { extractSongEraOptionFromModelText } from '@/lib/gemini';
import {
  resolveAssignedSongEra,
  songEraFromOriginalReleaseDate,
  songEraFromYoutubePublishedAt,
} from '@/lib/song-era';

test('songEraFromYoutubePublishedAt: 2018 MV → 10s', () => {
  assert.equal(songEraFromYoutubePublishedAt('2018-05-04T12:00:00.000Z'), '10s');
});

test('songEraFromYoutubePublishedAt: 2024 → 20s', () => {
  assert.equal(songEraFromYoutubePublishedAt('2024-01-01T00:00:00.000Z'), '20s');
});

test('songEraFromYoutubePublishedAt: null / invalid', () => {
  assert.equal(songEraFromYoutubePublishedAt(null), null);
  assert.equal(songEraFromYoutubePublishedAt(''), null);
  assert.equal(songEraFromYoutubePublishedAt('not-a-date'), null);
});

test('songEraFromOriginalReleaseDate: 1987 original → 80s', () => {
  assert.equal(songEraFromOriginalReleaseDate('1987-01-01'), '80s');
  assert.equal(songEraFromOriginalReleaseDate('1984.12'), '80s');
  assert.equal(songEraFromOriginalReleaseDate('1987'), '80s');
});

test('resolveAssignedSongEra: original release beats YouTube upload and cache', () => {
  assert.equal(
    resolveAssignedSongEra({
      originalReleaseDate: '1987-10-01',
      cachedEra: '20s',
      youtubePublishedAt: '2011-01-01T00:00:00.000Z',
      aiEra: '10s',
    }),
    '80s',
  );
  assert.equal(
    resolveAssignedSongEra({
      originalReleaseDate: null,
      cachedEra: '70s',
      youtubePublishedAt: '2018-01-01T00:00:00.000Z',
    }),
    '70s',
  );
  assert.equal(
    resolveAssignedSongEra({
      originalReleaseDate: '',
      cachedEra: 'Other',
      youtubePublishedAt: '2018-05-01T00:00:00.000Z',
    }),
    '10s',
  );
});

test('extractSongEraOptionFromModelText: plain label', () => {
  assert.equal(extractSongEraOptionFromModelText('10s'), '10s');
  assert.equal(extractSongEraOptionFromModelText('Pre-50s'), 'Pre-50s');
});

test('extractSongEraOptionFromModelText: embedded in sentence', () => {
  assert.equal(
    extractSongEraOptionFromModelText('This song is mainly from the 10s decade.'),
    '10s',
  );
  assert.equal(extractSongEraOptionFromModelText('録音は 70s が中心です。'), '70s');
});

test('extractSongEraOptionFromModelText: no label → null', () => {
  assert.equal(extractSongEraOptionFromModelText('年代はよく分かりません。'), null);
});
