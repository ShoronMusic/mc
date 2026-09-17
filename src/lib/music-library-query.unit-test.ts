/**
 * `npx tsx src/lib/music-library-query.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  musicLibraryArtistSlugForName,
  musicLibrarySongBelongsToNavStyle,
  pickRankedVideosBySong,
  resolveMusicLibraryListArtists,
  sortMusicLibrarySongs,
  musicLibrarySqlScopeMode,
  takeNewestPerStyle,
  toMusicLibrarySongCard,
  countMusicLibraryArtistsByLetter,
  filterMusicLibraryArtistsByLetter,
  finalizeMusicLibraryArtistIndexItems,
  applyMusicLibraryArtistIndexSongCounts,
  lookupMusicLibraryArtistIndexRef,
  mergeMusicLibraryArtistIndexRefs,
  musicLibraryArtistIndexDisplayName,
  filterMusicLibraryArtistsBySearchQuery,
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
assert.equal(card.intro, null);
assert.deepEqual(card.vocalLabels, []);
assert.equal(card.genreLabel, null);
assert.deepEqual(card.genreLinks, []);
assert.equal(card.artists?.[0]?.name, 'The Police');
assert.equal(card.styleLabel, null);
assert.equal(
  toMusicLibrarySongCard(
    {
      id: 'uuid-intro',
      main_artist: 'The Police',
      song_title: 'Roxanne',
      display_title: null,
      original_release_date: '1978-01-01',
      music8_intro: '1978年にリリースされたデビューアルバムの代表曲で、鋭いギターが印象的。',
    },
    null,
  ).intro,
  '1978年にリリースされたデビューアルバムの代表曲で、鋭いギターが印象的。',
);

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
assert.deepEqual(labeled.genreLinks, [
  { name: 'Pop-punk', slug: 'pop-punk', href: '/music/genres/pop-punk/1' },
  { name: 'Pop', slug: 'pop', href: '/music/genres/pop/1' },
]);
assert.equal(labeled.artists?.[0]?.name, 'Shygirl');
assert.equal(labeled.styleSlug, 'pop');
assert.equal(labeled.styleLabel, 'Pop');

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
assert.deepEqual(fromSnap.genreLinks, [
  { name: 'Synth-pop', slug: 'synth-pop', href: '/music/genres/synth-pop/1' },
  { name: 'Pop', slug: 'pop', href: '/music/genres/pop/1' },
]);

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

assert.equal(musicLibrarySongBelongsToNavStyle('Metal', 'pop'), false);
assert.equal(musicLibrarySongBelongsToNavStyle('Metal', 'metal'), true);
assert.equal(musicLibrarySongBelongsToNavStyle('Pop', 'pop'), true);
assert.equal(musicLibrarySongBelongsToNavStyle('', 'pop'), true);
assert.equal(musicLibrarySongBelongsToNavStyle(null, 'metal'), true);

const letterCounts = countMusicLibraryArtistsByLetter([
  { indexLetter: 'A' },
  { indexLetter: 'a' },
  { indexLetter: '#' },
  { indexLetter: '9' },
  { indexLetter: '2' },
]);
assert.equal(letterCounts.get('a'), 2);
assert.equal(letterCounts.get('other'), 1);
assert.equal(letterCounts.get('0-9'), 2);

const finalized = finalizeMusicLibraryArtistIndexItems([
  {
    name: 'Bryan Adams',
    slug: 'bryan-adams',
    href: '/music/all-for-love',
    count: 48,
    indexLetter: 'A',
    imageUrl: 'https://example.com/bryan.jpg',
  },
  {
    name: 'All For Love',
    slug: 'bryan-adams',
    href: '/music/all-for-love',
    count: 2,
    indexLetter: 'A',
  },
  {
    name: 'a-ha',
    slug: 'a-ha',
    href: '/music/a-ha',
    count: 13,
    indexLetter: 'A',
  },
]);
assert.equal(finalized.length, 2);
const bryan = finalized.find((it) => it.slug === 'bryan-adams');
assert.equal(bryan?.name, 'Bryan Adams');
assert.equal(bryan?.count, 50);
assert.equal(bryan?.indexLetter, 'B');
assert.equal(bryan?.href, '/music/bryan-adams');
assert.equal(bryan?.imageUrl, 'https://example.com/bryan.jpg');
assert.equal(filterMusicLibraryArtistsByLetter(finalized, 'a').some((it) => it.slug === 'bryan-adams'), false);
assert.equal(filterMusicLibraryArtistsByLetter(finalized, 'b').some((it) => it.slug === 'bryan-adams'), true);
assert.equal(
  filterMusicLibraryArtistsByLetter(
    [{ name: 'Bryan Adams', slug: 'bryan-adams', href: '/music/bryan-adams', count: 48, indexLetter: 'A' }],
    'a',
  ).length,
  0,
);
assert.equal(
  filterMusicLibraryArtistsByLetter(
    [{ name: '911', slug: '911', href: '/music/911', count: 3, indexLetter: '9' }],
    '0-9',
  ).some((it) => it.slug === '911'),
  true,
);
assert.equal(
  filterMusicLibraryArtistsByLetter(
    [{ name: '!!!', slug: 'chk-chk-chk', href: '/music/chk-chk-chk', count: 2, indexLetter: '#' }],
    'other',
  ).some((it) => it.slug === 'chk-chk-chk'),
  true,
);

assert.equal(
  musicLibraryArtistIndexDisplayName({
    mainArtist: 'ash',
    slug: 'ash',
    resolvedDisplayName: 'Ash',
  }),
  'Ash',
);
assert.equal(
  lookupMusicLibraryArtistIndexRef(
    new Map([
      [
        'ash',
        {
          slug: 'ash',
          displayName: 'Ash',
          originLabel: 'UK',
          activeStartYear: 1992,
          imageUrl: 'https://example.com/ash.jpg',
        },
      ],
    ]),
    'ash',
  )?.displayName,
  'Ash',
);

const mergedCasing = finalizeMusicLibraryArtistIndexItems([
  { name: 'ash', slug: 'ash', href: '/music/ash', count: 47, indexLetter: 'A' },
  {
    name: 'Ash',
    slug: 'ash',
    href: '/music/ash',
    count: 0,
    indexLetter: 'A',
    originLabel: 'UK',
    imageUrl: 'https://example.com/ash.jpg',
  },
]);
assert.equal(mergedCasing[0]?.name, 'Ash');
assert.equal(mergedCasing[0]?.originLabel, 'UK');
assert.equal(mergedCasing[0]?.imageUrl, 'https://example.com/ash.jpg');
assert.equal(mergedCasing[0]?.count, 47);

const fiveSosMerged = finalizeMusicLibraryArtistIndexItems(
  [
    {
      name: '5 Seconds of Summer',
      slug: '5-seconds-of-summer',
      href: '/music/5-seconds-of-summer',
      count: 33,
      indexLetter: '5',
    },
    {
      name: '5sos',
      slug: '5sos',
      href: '/music/5sos',
      count: 33,
      indexLetter: '5',
      originLabel: 'AUS',
      imageUrl: 'https://example.com/5sos.jpg',
    },
  ],
  { '5sos': 33 },
);
assert.equal(fiveSosMerged.length, 1);
assert.equal(fiveSosMerged[0]?.name, '5 Seconds of Summer');
assert.equal(fiveSosMerged[0]?.slug, '5sos');
assert.equal(fiveSosMerged[0]?.href, '/music/5sos');
assert.equal(fiveSosMerged[0]?.originLabel, 'AUS');
assert.ok((fiveSosMerged[0]?.searchNames ?? []).some((n) => n.toLowerCase() === '5sos'));
assert.equal(filterMusicLibraryArtistsBySearchQuery(fiveSosMerged, '5sos')[0]?.slug, '5sos');
assert.equal(filterMusicLibraryArtistsBySearchQuery(fiveSosMerged, '5 Seconds of Summer')[0]?.slug, '5sos');
assert.equal(filterMusicLibraryArtistsBySearchQuery(fiveSosMerged, '5SOS')[0]?.slug, '5sos');

const arianaMerged = mergeMusicLibraryArtistIndexRefs(
  {
    slug: 'ariana-grande',
    displayName: 'Ariana Grande',
    originLabel: null,
    activeStartYear: null,
    imageUrl: null,
  },
  {
    slug: 'ariana-grande',
    displayName: 'The Weeknd, Ariana Grande',
    originLabel: 'US',
    activeStartYear: 2013,
    imageUrl: 'https://example.com/ariana.jpg',
  },
);
assert.equal(arianaMerged.displayName, 'Ariana Grande');
assert.equal(arianaMerged.originLabel, 'US');
assert.equal(arianaMerged.imageUrl, 'https://example.com/ariana.jpg');

const searchPool = [
  { name: 'Grimes', slug: 'grimes', href: '/music/grimes', count: 29, indexLetter: 'G' },
  { name: 'Chelcee Grimes', slug: 'chelcee-grimes', href: '/music/chelcee-grimes', count: 1, indexLetter: 'C' },
  { name: 'The Beatles', slug: 'beatles', href: '/music/beatles', count: 80, indexLetter: 'B' },
  { name: 'Ariana Grande', slug: 'ariana-grande', href: '/music/ariana-grande', count: 24, indexLetter: 'A' },
];
const grimesHits = filterMusicLibraryArtistsBySearchQuery(searchPool, 'grimes');
assert.equal(grimesHits.length, 2);
assert.equal(grimesHits[0]?.name, 'Grimes');
assert.equal(grimesHits[1]?.name, 'Chelcee Grimes');
assert.equal(filterMusicLibraryArtistsBySearchQuery(searchPool, 'beatles')[0]?.name, 'The Beatles');
assert.equal(
  filterMusicLibraryArtistsBySearchQuery(searchPool, 'グライムズ', ['Grimes']).map((it) => it.name).join(','),
  'Grimes',
);
assert.deepEqual(filterMusicLibraryArtistsBySearchQuery(searchPool, ''), []);

const princeListed = applyMusicLibraryArtistIndexSongCounts(
  [
    { name: 'Prince', slug: 'prince', href: '/music/prince', count: 108, indexLetter: 'P' },
    { name: 'Madonna', slug: 'madonna', href: '/music/madonna', count: 40, indexLetter: 'M' },
  ],
  { prince: 66 },
  { prince: 'pop' },
);
assert.equal(princeListed.find((it) => it.slug === 'prince')?.count, 66);
assert.equal(princeListed.find((it) => it.slug === 'prince')?.styleSlug, 'pop');
assert.equal(princeListed.find((it) => it.slug === 'madonna')?.count, 40);
assert.equal(
  applyMusicLibraryArtistIndexSongCounts(
    [{ name: 'Only Credits', slug: 'only-credits', href: '/music/only-credits', count: 12, indexLetter: 'O' }],
    { 'only-credits': 0 },
  ).length,
  0,
);

console.log('music-library-query.unit-test: ok');
