import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareLibraryReleaseSort,
  libraryEffectiveReleaseDateForSort,
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
