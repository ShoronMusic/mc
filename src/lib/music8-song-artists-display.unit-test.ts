import assert from 'node:assert/strict';
import {
  extractMusic8SongArtistsForDisplay,
  formatMusic8SongArtistsLine,
} from '@/lib/music8-song-artists-display';

function run() {
  const bothLike = {
    artists: [
      { name: '21 Savage', slug: '21-savage' },
      { name: 'BIA', slug: 'bia' },
      { name: 'Tiësto', slug: 'tiesto' },
    ],
    acf: {
      spotify_artists: 'Tiësto, 21 Savage, BIA',
      spotify_artists01: 'Tiësto',
      spotify_artists02: '21 Savage',
      spotify_artists03: 'BIA',
    },
    videoId: 'L27voWLij-c',
  };

  const artists = extractMusic8SongArtistsForDisplay(bothLike, 'tiesto');
  assert.equal(artists.length, 3);
  assert.equal(artists[0]?.name, 'Tiësto');
  assert.equal(artists[0]?.role, 'main');
  assert.equal(artists[1]?.name, '21 Savage');
  assert.equal(artists[1]?.role, 'featured');
  assert.equal(artists[2]?.name, 'BIA');
  assert.equal(artists[2]?.slug, 'bia');

  assert.equal(
    formatMusic8SongArtistsLine(artists),
    'Tiësto, 21 Savage, BIA',
  );
  assert.equal(formatMusic8SongArtistsLine(null, 'Fallback'), 'Fallback');

  const single = extractMusic8SongArtistsForDisplay({
    artists: [{ name: 'Oasis', slug: 'oasis' }],
    acf: { spotify_artists: 'Oasis' },
  });
  assert.equal(single.length, 1);
  assert.equal(single[0]?.role, 'main');

  console.log('music8-song-artists-display.unit-test: ok');
}

run();
