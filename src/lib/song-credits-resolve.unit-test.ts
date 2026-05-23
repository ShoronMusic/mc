import assert from 'node:assert/strict';
import {
  buildArtistLookupIndex,
  parseSpotifyArtistsString,
  resolveArtistIdFromIndex,
  resolveSongCreditsFromInput,
} from '@/lib/song-credits-resolve';

function run() {
  assert.deepEqual(parseSpotifyArtistsString('Lady Gaga, Bruno Mars'), ['Lady Gaga', 'Bruno Mars']);
  assert.deepEqual(parseSpotifyArtistsString('Tyler, The Creator'), ['Tyler, The Creator']);
  assert.deepEqual(parseSpotifyArtistsString('Simon & Garfunkel'), ['Simon & Garfunkel']);

  const index = buildArtistLookupIndex([
    { id: 'g1', name: 'Lady Gaga', music8_artist_slug: 'lady-gaga' },
    { id: 'b1', name: 'bruno mars', music8_artist_slug: 'bruno-mars' },
  ]);

  const { credits, unresolved } = resolveSongCreditsFromInput(
    {
      spotify_artists: 'Lady Gaga, Bruno Mars',
      main_artist: 'Lady Gaga, Bruno Mars',
      music8_song_data: {
        main_artists: [
          { name: 'Bruno Mars', slug: 'bruno-mars' },
          { name: 'Lady Gaga', slug: 'lady-gaga' },
        ],
      },
    },
    index,
  );

  assert.equal(unresolved.length, 0);
  assert.equal(credits.length, 2);
  assert.equal(credits[0].artistId, 'g1');
  assert.equal(credits[1].artistId, 'b1');
  assert.equal(credits[0].role, 'main');
  assert.equal(credits[1].role, 'main');

  assert.equal(
    resolveArtistIdFromIndex(index, 'Lady Gaga', { name: 'Lady Gaga', slug: 'lady-gaga' }),
    'g1',
  );

  console.log('song-credits-resolve.unit-test: ok');
}

run();
