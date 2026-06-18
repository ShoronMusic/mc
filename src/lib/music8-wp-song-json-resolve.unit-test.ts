import assert from 'node:assert/strict';
import {
  artistDuoNameToMusic8Slug,
  canonicalArtistSlugFromArtistSongsListRow,
  collectArtistSlugsForRow,
  collectSlugPairsForRow,
  collectSongSlugHintsForRow,
  findArtistSongsListRowByVideoId,
  resolveMusic8Slugs,
  stripBracketedMetadataFromSongTitle,
} from '@/lib/music8-wp-song-json-resolve';

function run() {
  const fromCols = resolveMusic8Slugs({
    main_artist: 'Tiësto',
    song_title: 'Both',
    music8_artist_slug: '21-savage',
    music8_song_slug: 'both',
    spotify_artists: 'Tiësto, BIA, 21 Savage',
  });
  assert.deepEqual(fromCols, { artistSlug: '21-savage', songSlug: 'both' });

  const fromTitle = resolveMusic8Slugs({
    main_artist: 'Coolio',
    song_title: "Gangsta's Paradise",
    music8_artist_slug: null,
    music8_song_slug: null,
    spotify_artists: 'Coolio, L.V.',
  });
  assert.ok(fromTitle);
  assert.equal(fromTitle!.artistSlug, 'coolio');
  assert.ok(fromTitle!.songSlug.includes('gangsta'));

  const pairs = collectSlugPairsForRow({
    main_artist: 'Coolio',
    song_title: "Gangsta's Paradise",
    music8_artist_slug: null,
    music8_song_slug: null,
    spotify_artists: 'Coolio, L.V.',
  });
  assert.ok(pairs.some((p) => p.artistSlug === 'coolio' && p.songSlug.length > 0));
  assert.ok(pairs.some((p) => p.artistSlug === 'l-v'));

  const artistSlugs = collectArtistSlugsForRow({
    main_artist: 'ARTBAT',
    song_title: 'We Are The People',
    music8_artist_slug: 'artbat',
    music8_song_slug: 'we-are-the-people',
    spotify_artists: 'Empire Of The Sun, ARTBAT',
  });
  assert.ok(artistSlugs.includes('empire-of-the-sun'));
  assert.ok(artistSlugs.includes('artbat'));

  const listRows = [
    {
      slug: 'we-are-the-people-2',
      ytvideoid: 'YovBkx5wnFo',
      spotify_artists: 'Empire Of The Sun, ARTBAT',
    },
  ];
  const hit = findArtistSongsListRowByVideoId(listRows, 'YovBkx5wnFo');
  assert.ok(hit);
  assert.equal(canonicalArtistSlugFromArtistSongsListRow(hit!, 'empire-of-the-sun'), 'empire-of-the-sun');

  assert.equal(artistDuoNameToMusic8Slug('Macklemore & Ryan Lewis'), 'macklemore-ryan-lewis');
  assert.equal(stripBracketedMetadataFromSongTitle('In The End [Official Hd Music Video]'), 'In The End');
  const linkinHints = collectSongSlugHintsForRow({
    main_artist: 'In The End [Official Hd Music Video]',
    song_title: 'Linkin Park',
    display_title: 'In The End [Official Hd Music Video] - Linkin Park',
    music8_artist_slug: null,
    music8_song_slug: null,
    spotify_artists: 'Linkin Park, Motion Man',
  });
  assert.ok(linkinHints.includes('in-the-end'));

  console.log('music8-wp-song-json-resolve.unit-test: ok');
}

run();
