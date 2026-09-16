import assert from 'node:assert/strict';
import { parseLibraryArtistIndexSnapshotPayload } from '@/lib/build-library-artist-index';

function run() {
  assert.equal(parseLibraryArtistIndexSnapshotPayload({ items: [], letters: [] }), null);
  assert.equal(parseLibraryArtistIndexSnapshotPayload({ items: 'x', letters: [] }), null);

  const ok = parseLibraryArtistIndexSnapshotPayload({
    items: [
      { main_artist: 'The Beatles', count: 10, indexLetter: 'B' },
      { main_artist: '', count: 3, indexLetter: 'X' },
      { main_artist: 'Oasis', count: 0, indexLetter: 'O' },
      { main_artist: 'Queen', count: 5, indexLetter: 'Q' },
    ],
    letters: ['B', 'Q', 1, ''],
    countsBySlug: { beatles: 10, queen: 5 },
    styleBySlug: { beatles: 'rock', queen: 'rock' },
  });
  assert.ok(ok);
  assert.deepEqual(
    ok.items.map((i) => i.main_artist),
    ['The Beatles', 'Queen'],
  );
  assert.deepEqual(ok.letters, ['B', 'Q']);
  assert.equal(ok.countsBySlug.beatles, 10);
  assert.equal(ok.styleBySlug.beatles, 'rock');
  const fromItems = parseLibraryArtistIndexSnapshotPayload({
    items: [
      { main_artist: 'Prince', count: 108, indexLetter: 'P' },
      { __countsBySlug: { prince: 66 }, __styleBySlug: { prince: 'pop' } },
    ],
    letters: ['P'],
  });
  assert.equal(fromItems?.countsBySlug.prince, 66);
  assert.equal(fromItems?.styleBySlug.prince, 'pop');
  assert.equal(fromItems?.items.length, 1);
  assert.equal(
    parseLibraryArtistIndexSnapshotPayload({
      items: [{ main_artist: 'Queen', count: 5, indexLetter: 'Q' }],
      letters: ['Q'],
    }),
    null,
  );

  console.log('build-library-artist-index.unit-test: ok');
}

run();
