import assert from 'node:assert/strict';
import {
  deserializeMusic8WpSongsVideoIndex,
  extractYoutubeVideoIdFromWpSongJson,
  parseWpSongJsonBasename,
  serializeMusic8WpSongsVideoIndex,
} from '@/lib/music8-wp-songs-video-index';

function run() {
  assert.deepEqual(parseWpSongJsonBasename('tiesto_both.json'), {
    artistSlug: 'tiesto',
    songSlug: 'both',
  });
  assert.equal(parseWpSongJsonBasename('nounderscore.json'), null);

  assert.equal(
    extractYoutubeVideoIdFromWpSongJson({ videoId: 'L27voWLij-c' }),
    'L27voWLij-c',
  );
  assert.equal(
    extractYoutubeVideoIdFromWpSongJson({ acf: { ytvideoid: 'abc12345678' } }),
    'abc12345678',
  );
  assert.equal(extractYoutubeVideoIdFromWpSongJson({}), null);

  const index = deserializeMusic8WpSongsVideoIndex({
    'L27voWLij-c': { artistSlug: 'tiesto', songSlug: 'both', basename: 'tiesto_both.json' },
  });
  assert.equal(index.get('L27voWLij-c')?.artistSlug, 'tiesto');

  const round = deserializeMusic8WpSongsVideoIndex(
    serializeMusic8WpSongsVideoIndex(index) as Record<string, { artistSlug: string; songSlug: string; basename: string }>,
  );
  assert.equal(round.size, 1);

  console.log('music8-wp-songs-video-index.unit-test: ok');
}

run();
