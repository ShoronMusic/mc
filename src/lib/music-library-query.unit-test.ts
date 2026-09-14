/**
 * `npx tsx src/lib/music-library-query.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  musicLibraryArtistSlugForName,
  pickRankedVideosBySong,
  resolveMusicLibraryListArtists,
  sortMusicLibrarySongs,
  musicLibrarySqlScopeMode,
  takeNewestPerStyle,
  toMusicLibrarySongCard,
} from '@/lib/music-library-query';

assert.equal(musicLibraryArtistSlugForName('Madonna', 'madonna'), 'madonna');
assert.equal(musicLibraryArtistSlugForName('Madonna', ''), 'madonna');
assert.equal(musicLibraryArtistSlugForName('X', 'styles'), 'x');

const ranked = pickRankedVideosBySong([
  { song_id: 's1', video_id: 'live1', variant: 'live' },
  { song_id: 's1', video_id: 'off1', variant: 'official' },
  { song_id: 's2', video_id: 't2', variant: 'topic' },
]);
assert.equal(ranked.get('s1')?.videoId, 'off1');
assert.equal(ranked.get('s2')?.videoId, 't2');

const older = {
  id: 'a',
  main_artist: 'A',
  song_title: 'Old',
  display_title: null,
  original_release_date: '1990-01-01',
};
const newer = {
  id: 'b',
  main_artist: 'B',
  song_title: 'New',
  display_title: null,
  original_release_date: '2020-06-01',
};
const sorted = sortMusicLibrarySongs([older, newer]);
assert.equal(sorted[0]?.id, 'b');

const card = toMusicLibrarySongCard(
  {
    id: 'uuid-1',
    main_artist: 'The Police',
    song_title: 'Every Breath You Take',
    display_title: 'The Police - Every Breath You Take',
    original_release_date: '1983-05-20',
    music8_artist_slug: 'police',
    music8_song_slug: 'every-breath-you-take',
    spotify_images: 'https://example.com/c.jpg',
  },
  'abc123',
);
assert.equal(card.href, '/music/police/songs/every-breath-you-take');
assert.equal(card.artistHref, '/music/police');
assert.equal(card.videoId, 'abc123');
assert.equal(card.releaseDate, '1983-05-20');
assert.deepEqual(card.vocalLabels, []);
assert.equal(card.genreLabel, null);
assert.equal(card.artists?.[0]?.name, 'The Police');

const labeled = toMusicLibrarySongCard(
  {
    id: 'uuid-label',
    main_artist: 'Shygirl',
    song_title: 'Lucky',
    display_title: null,
    original_release_date: '2026-09-01',
    music8_artist_slug: 'shygirl',
    music8_song_slug: 'lucky',
    vocal: 'F',
    genres: ['Pop-punk', 'Pop'],
    style: 'Pop',
  },
  null,
);
assert.deepEqual(labeled.vocalLabels, ['F']);
assert.equal(labeled.genreLabel, 'Pop-punk / Pop');
assert.equal(labeled.artists?.[0]?.name, 'Shygirl');
assert.equal(labeled.styleSlug, 'pop');

const fromSnap = toMusicLibrarySongCard(
  {
    id: 'uuid-snap',
    main_artist: 'Band',
    song_title: 'Tune',
    display_title: null,
    original_release_date: null,
    music8_song_data: {
      kind: 'musicaichat_v1',
      vocal: 'Female',
      genres: ['Synth-pop', 'Pop'],
    },
  },
  null,
);
assert.deepEqual(fromSnap.vocalLabels, ['F']);
assert.equal(fromSnap.genreLabel, 'Synth-pop / Pop');

const duet = toMusicLibrarySongCard(
  {
    id: 'uuid-duet',
    main_artist: 'The Weeknd, Tomoko Aran',
    song_title: 'Out Of Time',
    display_title: null,
    original_release_date: '2026-08-01',
    music8_artist_slug: 'the-weeknd',
    vocal: 'F,M',
  },
  null,
);
assert.deepEqual(duet.vocalLabels, ['F', 'M']);
assert.equal(duet.artists?.length, 2);
assert.equal(duet.artists?.[0]?.name, 'The Weeknd');
assert.equal(duet.artists?.[1]?.name, 'Tomoko Aran');
assert.equal(duet.artists?.[0]?.href, '/music/the-weeknd');
assert.equal(duet.artists?.[1]?.href, '/music/tomoko-aran');

const fromCredits = resolveMusicLibraryListArtists({
  artistName: 'Logic1000, Christine and the Queens',
  artistSlug: 'logic1000',
  creditArtists: [
    { name: 'Logic1000', slug: 'logic1000', href: '/music/logic1000', originLabel: 'AUS' },
    {
      name: 'Christine and the Queens',
      slug: 'christine-and-the-queens',
      href: '/music/christine-and-the-queens',
      originLabel: 'FRA',
    },
  ],
});
assert.equal(fromCredits.length, 2);
assert.equal(fromCredits[0]?.originLabel, 'AUS');
assert.equal(fromCredits[1]?.name, 'Christine and the Queens');
assert.equal(fromCredits[1]?.originLabel, 'FRA');

const noSlug = toMusicLibrarySongCard(
  {
    id: 'uuid-2',
    main_artist: 'Someone',
    song_title: 'Untitled Song',
    display_title: null,
    original_release_date: null,
    music8_artist_slug: null,
    music8_song_slug: null,
  },
  null,
);
assert.equal(noSlug.href, null);

const top = takeNewestPerStyle(
  new Map([
    [
      'pop',
      [
        { ...card, id: '1' },
        { ...card, id: '2' },
        { ...card, id: '3' },
        { ...card, id: '4' },
      ],
    ],
  ]),
  3,
);
assert.equal(top.length, 9);
assert.equal(top[0]?.slug, 'pop');
assert.equal(top[0]?.songs.length, 3);
assert.equal(top[1]?.songs.length, 0);

assert.equal(musicLibrarySqlScopeMode('western'), 'exclude-domestic');
assert.equal(musicLibrarySqlScopeMode('domestic'), 'domestic-only');
assert.equal(musicLibrarySqlScopeMode('all'), 'all');

console.log('music-library-query.unit-test: ok');
