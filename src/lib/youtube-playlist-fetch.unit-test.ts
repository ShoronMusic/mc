/**
 * `npx tsx src/lib/youtube-playlist-fetch.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { normalizeYoutubePlaylistItems } from '@/lib/youtube-playlist-fetch';

function run() {
  const out = normalizeYoutubePlaylistItems(
    [
      {
        snippet: {
          title: 'Boy Harsher - Jeans (Official Video)',
          videoOwnerChannelTitle: 'Boy Harsher',
        },
        contentDetails: { videoId: 'aaaaaaaaaaa' },
      },
      {
        snippet: {
          title: 'Private video',
          videoOwnerChannelTitle: 'Someone',
        },
        contentDetails: { videoId: 'bbbbbbbbbbb' },
      },
      {
        snippet: {
          title: 'Duplicate - Skip',
          videoOwnerChannelTitle: 'Dup',
        },
        contentDetails: { videoId: 'aaaaaaaaaaa' },
      },
      {
        snippet: {
          title: 'Olivia Rodrigo - expectations',
          channelTitle: 'playlist owner',
        },
        contentDetails: { videoId: 'ccccccccccc' },
      },
    ],
    1,
  );

  assert.equal(out.totalFetched, 2);
  assert.equal(out.truncated, true);
  assert.equal(out.songs.length, 1);
  assert.equal(out.songs[0]!.videoId, 'aaaaaaaaaaa');
  assert.equal(out.songs[0]!.artist, 'Boy Harsher');
  assert.equal(out.songs[0]!.title, 'Jeans');

  const unlimited = normalizeYoutubePlaylistItems(
    [
      {
        snippet: { title: 'One - A', videoOwnerChannelTitle: 'A' },
        contentDetails: { videoId: 'aaaaaaaaaaa' },
      },
      {
        snippet: { title: 'Two - B', videoOwnerChannelTitle: 'B' },
        contentDetails: { videoId: 'bbbbbbbbbbb' },
      },
    ],
    null,
  );
  assert.equal(unlimited.songs.length, 2);
  assert.equal(unlimited.truncated, false);
  assert.equal(unlimited.totalFetched, 2);

  console.log('youtube-playlist-fetch unit tests: OK');
}

run();
