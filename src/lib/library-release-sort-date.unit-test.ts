import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareLibraryReleaseSort,
  libraryEffectiveReleaseDateForSort,
  resolveLibraryOriginalReleaseDate,
} from './library-release-sort-date';

test('libraryEffectiveReleaseDateForSort prefers original', () => {
  assert.equal(
    libraryEffectiveReleaseDateForSort({
      originalReleaseDate: '2019-01-01',
      youtubePublishedAt: '2024-06-01T00:00:00Z',
    }),
    '2019-01-01',
  );
});

test('resolveLibraryOriginalReleaseDate prefers Music8 album date over polluted column', () => {
  assert.equal(
    resolveLibraryOriginalReleaseDate({
      originalReleaseDate: '2018-06-21',
      music8SongData: { kind: 'music8_wp_song', releaseDate_normalized: '1965.07' },
    }),
    '1965-07-01',
  );
});

test('libraryEffectiveReleaseDateForSort falls back to youtube', () => {
  assert.equal(
    libraryEffectiveReleaseDateForSort({
      originalReleaseDate: null,
      youtubePublishedAt: '2024-06-15T12:00:00Z',
    }),
    '2024-06-15',
  );
});

test('compareLibraryReleaseSort newer first with youtube fallback', () => {
  const older = { originalReleaseDate: null, youtubePublishedAt: '2020-01-01' };
  const newer = { originalReleaseDate: null, youtubePublishedAt: '2024-01-01' };
  assert.ok(compareLibraryReleaseSort(newer, older, 'desc') < 0);
  assert.ok(compareLibraryReleaseSort(newer, older, 'asc') > 0);
});
