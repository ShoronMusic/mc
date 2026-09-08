import assert from 'node:assert/strict';
import { resolveSongCoverImage, youtubeThumbnailUrlFromVideoId } from './song-cover-image';

assert.equal(youtubeThumbnailUrlFromVideoId('aWpw-Ynl0Yc'), 'https://i.ytimg.com/vi/aWpw-Ynl0Yc/hqdefault.jpg');
assert.equal(youtubeThumbnailUrlFromVideoId('https://www.youtube.com/watch?v=aWpw-Ynl0Yc'), 'https://i.ytimg.com/vi/aWpw-Ynl0Yc/hqdefault.jpg');
assert.equal(youtubeThumbnailUrlFromVideoId(''), null);
assert.equal(youtubeThumbnailUrlFromVideoId('nope'), null);

{
  const r = resolveSongCoverImage({
    spotifyImages: 'https://i.scdn.co/image/abc',
    videoId: 'aWpw-Ynl0Yc',
  });
  assert.equal(r.source, 'spotify');
  assert.equal(r.url, 'https://i.scdn.co/image/abc');
}

{
  const r = resolveSongCoverImage({ spotifyImages: null, videoId: 'aWpw-Ynl0Yc' });
  assert.equal(r.source, 'youtube');
  assert.equal(r.url, 'https://i.ytimg.com/vi/aWpw-Ynl0Yc/hqdefault.jpg');
}

{
  const r = resolveSongCoverImage({ spotifyImages: '  ', videoId: null });
  assert.equal(r.source, null);
  assert.equal(r.url, null);
}

console.log('song-cover-image unit tests: OK');
