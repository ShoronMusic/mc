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
  });
  assert.ok(ok);
  assert.deepEqual(
    ok.items.map((i) => i.main_artist),
    ['The Beatles', 'Queen'],
  );
  assert.deepEqual(ok.letters, ['B', 'Q']);

  console.log('build-library-artist-index.unit-test: ok');
}

run();
