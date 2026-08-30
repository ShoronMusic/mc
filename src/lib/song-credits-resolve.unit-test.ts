import assert from 'node:assert/strict';
import {
  buildArtistLookupIndex,
  expandCompoundArtistTokens,
  parseSpotifyArtistsString,
  reconcileCreditNamesWithDisplayTitle,
  resolveArtistIdFromIndex,
  resolveSongCreditsFromInput,
} from '@/lib/song-credits-resolve';

function run() {
  assert.deepEqual(parseSpotifyArtistsString('Lady Gaga, Bruno Mars'), ['Lady Gaga', 'Bruno Mars']);
  assert.deepEqual(parseSpotifyArtistsString('Tyler, The Creator'), ['Tyler, The Creator']);
  assert.deepEqual(parseSpotifyArtistsString('Simon & Garfunkel'), ['Simon & Garfunkel']);
  assert.deepEqual(parseSpotifyArtistsString('Earth, Wind & Fire'), ['Earth, Wind & Fire']);
  assert.deepEqual(parseSpotifyArtistsString('Earth, Wind & Fire, The Emotions'), [
    'Earth, Wind & Fire',
    'The Emotions',
  ]);
  assert.deepEqual(parseSpotifyArtistsString('Metro Boomin, Roscoe Dash, DJ Spinz'), [
    'Metro Boomin',
    'Roscoe Dash',
    'DJ Spinz',
  ]);
  assert.deepEqual(expandCompoundArtistTokens(['Gunplay, A$AP Ferg']), ['Gunplay', 'A$AP Ferg']);
  assert.deepEqual(expandCompoundArtistTokens(['Tyler, The Creator']), ['Tyler, The Creator']);
  assert.deepEqual(
    reconcileCreditNamesWithDisplayTitle(
      ['Black Country', 'New Road'],
      'black country new road - Happy Birthday',
    ),
    ['black country new road'],
  );

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

  const aliasIndex = buildArtistLookupIndex([
    { id: 'suede', name: 'Suede', music8_artist_slug: 'suede' },
    { id: 'weeknd', name: 'The Weeknd', music8_artist_slug: 'weeknd' },
    { id: 'mgk', name: 'Machine Gun Kelly', music8_artist_slug: 'machine-gun-kelly' },
    { id: 'app', name: 'Alan Parsons Project', music8_artist_slug: 'alan-parsons-project' },
  ]);
  assert.equal(resolveArtistIdFromIndex(aliasIndex, 'The London Suede', null), 'suede');
  assert.equal(resolveArtistIdFromIndex(aliasIndex, 'TheWeeknd', null), 'weeknd');
  assert.equal(resolveArtistIdFromIndex(aliasIndex, 'mgk', null), 'mgk');
  assert.equal(resolveArtistIdFromIndex(aliasIndex, 'The Alan Parsons Project', null), 'app');

  const { skippedJapanese, credits: jpCredits } = resolveSongCreditsFromInput(
    {
      spotify_artists: 'テイラー・スウィフト',
      main_artist: 'Taylor Swift',
      music8_song_data: null,
    },
    aliasIndex,
  );
  assert.equal(skippedJapanese, true);
  assert.equal(jpCredits.length, 0);

  const { credits: suedeCredits, unresolved: suedeU, skippedJapanese: suedeJp } =
    resolveSongCreditsFromInput(
      {
        spotify_artists: 'The London Suede',
        main_artist: 'Suede',
        music8_song_data: null,
      },
      aliasIndex,
    );
  assert.equal(suedeJp, false);
  assert.equal(suedeU.length, 0);
  assert.equal(suedeCredits[0]?.artistId, 'suede');

  const { credits: bcnr, unresolved: bcnrU } = resolveSongCreditsFromInput(
    {
      trackArtistNames: ['Black Country, New Road'],
      spotify_artists: 'Black Country, New Road',
      main_artist: 'Black Country, New Road',
      music8_song_data: null,
    },
    buildArtistLookupIndex([{ id: 'bcnr', name: 'Black Country, New Road', music8_artist_slug: null }]),
  );
  assert.equal(bcnrU.length, 0);
  assert.equal(bcnr.length, 1);

  console.log('song-credits-resolve.unit-test: ok');
}

run();
