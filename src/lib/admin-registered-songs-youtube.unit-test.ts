import assert from 'node:assert/strict';
import { resolveRegisteredSongYoutubeId } from '@/lib/admin-registered-songs-youtube';

assert.equal(
  resolveRegisteredSongYoutubeId({ music8VideoId: 'abc123', videos: [{ videoId: 'other' }] }),
  'abc123',
);
assert.equal(resolveRegisteredSongYoutubeId({ music8VideoId: '  ', videos: [] }), null);
assert.equal(
  resolveRegisteredSongYoutubeId({
    music8VideoId: null,
    videos: [
      { videoId: 'live1', variant: 'live' },
      { videoId: 'official1', variant: 'official' },
      { videoId: 'lyric1', variant: 'lyric' },
    ],
  }),
  'official1',
);
assert.equal(
  resolveRegisteredSongYoutubeId({
    music8VideoId: '',
    videos: [{ videoId: 'only-one', variant: null }],
  }),
  'only-one',
);

console.log('admin-registered-songs-youtube.unit-test: ok');
