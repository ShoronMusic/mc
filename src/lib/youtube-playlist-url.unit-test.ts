/**
 * `npx tsx src/lib/youtube-playlist-url.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { isYoutubePlaylistUrl, parseYoutubePlaylistUrl } from '@/lib/youtube-playlist-url';

function run() {
  assert.equal(
    parseYoutubePlaylistUrl('https://www.youtube.com/playlist?list=PL1234567890abcdef')?.playlistId,
    'PL1234567890abcdef',
  );
  assert.equal(
    parseYoutubePlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abcdef')?.canonicalUrl,
    'https://www.youtube.com/playlist?list=PL1234567890abcdef',
  );
  assert.equal(
    parseYoutubePlaylistUrl('https://music.youtube.com/playlist?list=RDCLAK5uy_test123')?.playlistId,
    'RDCLAK5uy_test123',
  );
  assert.equal(isYoutubePlaylistUrl('https://youtu.be/dQw4w9WgXcQ'), false);
  assert.equal(isYoutubePlaylistUrl('https://example.com/playlist?list=PL1234567890abcdef'), false);
  assert.equal(isYoutubePlaylistUrl('not a url'), false);

  console.log('youtube-playlist-url unit tests: OK');
}

run();
