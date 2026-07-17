/**
 * `npx tsx src/lib/library-artist-autoplay.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  buildLibraryArtistAutoplayLaunch,
  librarySongListSortOrderLabel,
  prepareLibraryArtistAutoplaySongs,
} from '@/lib/library-artist-autoplay';

function run() {
  assert.equal(librarySongListSortOrderLabel('release_new'), '公開日が新しい順');
  assert.equal(librarySongListSortOrderLabel('title_asc'), '曲名A-Z順');

  const prepared = prepareLibraryArtistAutoplaySongs(
    [
      { videoId: 'aaaaaaaaaaa', title: 'One', artist: 'A' },
      { videoId: '', title: 'Skip', artist: 'A' },
      { videoId: 'aaaaaaaaaaa', title: 'Dup', artist: 'A' },
      { videoId: 'bbbbbbbbbbb', title: 'Two', artist: 'A' },
      { videoId: 'ccccccccccc', title: 'Three', artist: 'A' },
    ],
    2,
  );
  assert.equal(prepared.totalFetched, 3);
  assert.equal(prepared.truncated, true);
  assert.equal(prepared.songs.length, 2);
  assert.equal(prepared.songs[0]!.videoId, 'aaaaaaaaaaa');
  assert.equal(prepared.songs[1]!.videoId, 'bbbbbbbbbbb');

  const unlimited = prepareLibraryArtistAutoplaySongs(
    [
      { videoId: 'aaaaaaaaaaa', title: 'One', artist: 'A' },
      { videoId: 'bbbbbbbbbbb', title: 'Two', artist: 'A' },
      { videoId: 'ccccccccccc', title: 'Three', artist: 'A' },
    ],
    null,
  );
  assert.equal(unlimited.songs.length, 3);
  assert.equal(unlimited.truncated, false);

  const launch = buildLibraryArtistAutoplayLaunch({
    artistName: 'Howard Jones',
    orderLabel: '公開日が新しい順',
    maxSongs: 40,
    songs: [
      { videoId: 'aaaaaaaaaaa', title: 'What Is Love?', artist: 'Howard Jones' },
      { videoId: 'bbbbbbbbbbb', title: 'New Song', artist: 'Howard Jones' },
    ],
  });
  assert.ok(launch);
  assert.equal(launch!.state.sourceLabel, 'ライブラリ');
  assert.equal(launch!.state.songs.length, 2);
  assert.match(launch!.startMessage, /ライブラリ「Howard Jones」2曲を連続再生/);

  assert.equal(
    buildLibraryArtistAutoplayLaunch({
      artistName: 'X',
      songs: [{ videoId: null, title: 'No', artist: 'X' }],
    }),
    null,
  );

  console.log('library-artist-autoplay unit tests: OK');
}

run();
