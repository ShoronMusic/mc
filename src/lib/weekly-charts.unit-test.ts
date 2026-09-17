/**
 * `npx tsx src/lib/weekly-charts.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  artistsCompatibleForChartMatch,
  chartTitleVersionKind,
  formatWeeklyChartWeekLabel,
  latestChartPublishDateJst,
  listChartSongCandidates,
  matchChartTrackToCatalog,
  preferStoredChartSong,
  summarizeWeeklyChartMatches,
  titlesCompatibleForChartMatch,
  weeklyChartNewSongHref,
  weeklyChartPublicTitle,
  weeklyChartYoutubeSearchUrl,
  weeklyChartYoutubeWatchUrl,
  type WeeklyChartCatalogSong,
  type WeeklyChartCatalogVideo,
} from '@/lib/weekly-charts';

assert.equal(formatWeeklyChartWeekLabel('2026-09-15'), '2026.09.15');
assert.equal(weeklyChartPublicTitle('us'), 'US Billboard Hot 100');
assert.equal(weeklyChartPublicTitle('uk'), 'UK Official Singles');

const thuJst = new Date('2026-09-17T12:00:00+09:00');
assert.equal(latestChartPublishDateJst('us', thuJst), '2026-09-15');
assert.equal(latestChartPublishDateJst('uk', thuJst), '2026-09-11');

const tueJst = new Date('2026-09-15T18:00:00+09:00');
assert.equal(latestChartPublishDateJst('us', tueJst), '2026-09-15');

const monJst = new Date('2026-09-14T10:00:00+09:00');
assert.equal(latestChartPublishDateJst('us', monJst), '2026-09-08');

const friJst = new Date('2026-09-18T09:00:00+09:00');
assert.equal(latestChartPublishDateJst('uk', friJst), '2026-09-18');

assert.equal(chartTitleVersionKind('Luther'), 'plain');
assert.equal(chartTitleVersionKind('Luther (Remix)'), 'remix');
assert.ok(titlesCompatibleForChartMatch('Luther', 'Luther'));
assert.ok(titlesCompatibleForChartMatch('Luther (feat. SZA)', 'Luther'));
assert.equal(titlesCompatibleForChartMatch('Luther (Remix)', 'Luther'), false);
assert.ok(artistsCompatibleForChartMatch('Kendrick Lamar, SZA', 'Kendrick Lamar'));
assert.equal(artistsCompatibleForChartMatch('The Kid LAROI', 'Rihanna'), false);

assert.equal(
  weeklyChartYoutubeSearchUrl('Kendrick Lamar, SZA', 'Luther'),
  'https://www.youtube.com/results?search_query=Kendrick%20Lamar%20Luther',
);
assert.equal(weeklyChartYoutubeWatchUrl('abc'), 'https://www.youtube.com/watch?v=abc');
assert.equal(
  weeklyChartNewSongHref('Kendrick Lamar, SZA', 'Luther'),
  '/admin/songs/new?artist=Kendrick+Lamar&title=Luther',
);

const songs: WeeklyChartCatalogSong[] = [
  {
    id: 'song-luther',
    mainArtist: 'Kendrick Lamar, SZA',
    songTitle: 'Luther',
    displayTitle: 'Kendrick Lamar, SZA - Luther',
    spotifyTrackId: 'sp-luther',
  },
  {
    id: 'song-stay-rihanna',
    mainArtist: 'Rihanna',
    songTitle: 'Stay',
    displayTitle: 'Rihanna - Stay',
    spotifyTrackId: null,
  },
];
const videos: WeeklyChartCatalogVideo[] = [
  { songId: 'song-luther', videoId: 'yt-luther', variant: 'official', spotifyTrackId: 'sp-luther' },
];

const byId = matchChartTrackToCatalog(
  {
    spotifyTrackId: 'sp-luther',
    artistName: 'Kendrick Lamar',
    title: 'luther',
    spotifyArtists: 'Kendrick Lamar, SZA',
  },
  songs,
  videos,
);
assert.equal(byId.kind, 'spotify_id');
assert.equal(byId.song?.id, 'song-luther');
assert.equal(byId.youtubeVideoId, 'yt-luther');

const byTitle = matchChartTrackToCatalog(
  {
    spotifyTrackId: 'sp-other',
    artistName: 'Kendrick Lamar',
    title: 'Luther',
    spotifyArtists: 'Kendrick Lamar, SZA',
  },
  songs,
  videos,
);
assert.equal(byTitle.kind, 'artist_title');
assert.equal(byTitle.song?.id, 'song-luther');

const byVideoId = matchChartTrackToCatalog(
  {
    spotifyTrackId: 'sp-luther',
    artistName: 'Kendrick Lamar',
    title: 'Luther',
    spotifyArtists: 'Kendrick Lamar',
  },
  [{ ...songs[0]!, spotifyTrackId: null }],
  videos,
);
assert.equal(byVideoId.kind, 'spotify_id');
assert.equal(byVideoId.song?.id, 'song-luther');

const stayKid = matchChartTrackToCatalog(
  {
    spotifyTrackId: 'sp-stay-new',
    artistName: 'The Kid LAROI',
    title: 'Stay',
    spotifyArtists: 'The Kid LAROI, Justin Bieber',
  },
  songs,
  videos,
);
assert.equal(stayKid.kind, 'none');
assert.equal(stayKid.song, null);

const byUrl = matchChartTrackToCatalog(
  {
    spotifyTrackId: '0iA1unTbTbDOWUSlbwJ1pS',
    artistName: 'Sam Fender',
    title: 'Rein Me In (with Olivia Dean)',
    spotifyArtists: 'Sam Fender, Olivia Dean',
  },
  [
    {
      id: 'song-rein',
      mainArtist: 'Sam Fender',
      songTitle: 'Rein Me In',
      displayTitle: 'Sam Fender - Rein Me In',
      spotifyTrackId: 'https://open.spotify.com/track/0iA1unTbTbDOWUSlbwJ1pS',
    },
  ],
  [],
);
assert.equal(byUrl.kind, 'spotify_id');
assert.equal(byUrl.song?.id, 'song-rein');

const sameTitleDifferentId = matchChartTrackToCatalog(
  {
    spotifyTrackId: 'chartversion00000000001',
    artistName: 'Sam Fender',
    title: 'Rein Me In (with Olivia Dean)',
    spotifyArtists: 'Sam Fender, Olivia Dean',
  },
  [
    {
      id: 'song-rein',
      mainArtist: 'Sam Fender',
      songTitle: 'Rein Me In',
      displayTitle: 'Sam Fender - Rein Me In',
      spotifyTrackId: 'https://open.spotify.com/track/0iA1unTbTbDOWUSlbwJ1pS',
    },
  ],
  [],
);
assert.equal(sameTitleDifferentId.kind, 'artist_title');

const remix = matchChartTrackToCatalog(
  {
    spotifyTrackId: 'sp-luther-remix',
    artistName: 'Kendrick Lamar',
    title: 'Luther (Remix)',
    spotifyArtists: 'Kendrick Lamar, SZA',
  },
  songs,
  videos,
);
assert.equal(remix.kind, 'none');

const lyricSong: WeeklyChartCatalogSong = {
  id: 'song-rein-lyric',
  mainArtist: 'Sam Fender',
  songTitle: 'Rein Me In',
  displayTitle: 'Sam Fender - Rein Me In',
  spotifyTrackId: null,
};
const officialSong: WeeklyChartCatalogSong = {
  id: 'song-rein-official',
  mainArtist: 'Sam Fender, Olivia Dean',
  songTitle: 'Rein Me In',
  displayTitle: 'Sam Fender, Olivia Dean - Rein Me In',
  spotifyTrackId: null,
};
const reinTrack = {
  spotifyTrackId: 'chartversion00000000001',
  artistName: 'Sam Fender',
  title: 'Rein Me In (with Olivia Dean)',
  spotifyArtists: 'Sam Fender, Olivia Dean',
};
const reinVideos: WeeklyChartCatalogVideo[] = [
  { songId: 'song-rein-lyric', videoId: 'KO5crgJYMfQ', variant: 'official', spotifyTrackId: null },
  { songId: 'song-rein-official', videoId: '3triLkS0nq4', variant: 'official', spotifyTrackId: null },
];
const reinDup = matchChartTrackToCatalog(reinTrack, [lyricSong, officialSong], reinVideos);
assert.equal(reinDup.song?.id, 'song-rein-official');
assert.equal(reinDup.youtubeVideoId, '3triLkS0nq4');

const kept = preferStoredChartSong(reinDup, 'song-rein-lyric', [lyricSong, officialSong], reinVideos);
assert.equal(kept.song?.id, 'song-rein-lyric');
assert.equal(kept.youtubeVideoId, 'KO5crgJYMfQ');

const upgraded = preferStoredChartSong(
  {
    kind: 'spotify_id',
    song: officialSong,
    youtubeVideoId: '3triLkS0nq4',
  },
  'song-rein-lyric',
  [lyricSong, officialSong],
  reinVideos,
);
assert.equal(upgraded.song?.id, 'song-rein-official');

const candidates = listChartSongCandidates(reinTrack, [lyricSong, officialSong], reinVideos);
assert.equal(candidates.length, 2);
assert.ok(candidates.some((c) => c.songId === 'song-rein-lyric'));
assert.ok(candidates.some((c) => c.songId === 'song-rein-official'));

const counts = summarizeWeeklyChartMatches([{ matchKind: 'spotify_id' }, { matchKind: 'none' }, { matchKind: 'artist_title' }]);
assert.equal(counts.existingCount, 2);
assert.equal(counts.newCount, 1);

console.log('weekly-charts.unit-test: ok');
