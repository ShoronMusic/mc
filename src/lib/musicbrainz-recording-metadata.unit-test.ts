import { parseMusicBrainzRecordingMetadataFromSearch, pickSongTitleJaFromAliases } from './musicbrainz-recording-metadata';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const mb = parseMusicBrainzRecordingMetadataFromSearch({
  recordings: [
    {
      score: 95,
      title: '夜の踊り子',
      'first-release-date': '2013',
      'artist-credit': [{ name: 'サカナクション' }],
      genres: [{ name: 'J-Pop', count: 3 }],
      tags: [{ name: 'japanese', count: 2 }],
    },
  ],
});

assert(mb?.mainArtist === 'サカナクション', 'mb artist');
assert(mb?.songTitle === '夜の踊り子', 'mb song');
assert(mb?.displayTitle === 'サカナクション - 夜の踊り子', 'mb display');
assert(mb?.originalReleaseDate === '2013-01-01', 'mb release date');
assert(mb?.genres.includes('j-pop'), 'mb genres');
assert(mb?.songTitleJa === null, 'no aliases → null ja');

assert(
  parseMusicBrainzRecordingMetadataFromSearch({
    recordings: [{ score: 50, title: 'x', 'artist-credit': [{ name: 'y' }] }],
  }) === null,
  'low score rejected',
);

const tsunami = parseMusicBrainzRecordingMetadataFromSearch({
  recordings: [
    {
      score: 92,
      title: 'TSUNAMI',
      'first-release-date': '2005-06-25',
      'artist-credit': [{ name: 'サザンオールスターズ' }],
      releases: [{ date: '2005-06-25', status: 'Official' }],
    },
    {
      score: 90,
      title: 'TSUNAMI',
      'first-release-date': '2000-01-26',
      'artist-credit': [{ name: 'サザンオールスターズ' }],
      releases: [{ date: '2000-01-26', status: 'Official' }],
    },
  ],
});
assert(tsunami?.originalReleaseDate === '2000-01-26', 'mb release date picks earliest across hits');

assert(
  pickSongTitleJaFromAliases(
    [
      { name: 'Lemon', locale: 'en', primary: true },
      { name: 'レモン', 'sort-name': 'レモン', locale: 'ja', primary: true },
    ],
    'Lemon',
  ) === 'レモン',
  'ja alias kana',
);

assert(
  pickSongTitleJaFromAliases(
    [{ name: 'Peace Sign', 'sort-name': 'ピースサイン', locale: 'ja' }],
    'Peace Sign',
  ) === 'ピースサイン',
  'ja sort-name kana',
);

assert(
  pickSongTitleJaFromAliases([{ name: 'Lemon', locale: 'en' }], 'Lemon') === null,
  'no japanese reading',
);

const withInlineAliases = parseMusicBrainzRecordingMetadataFromSearch({
  recordings: [
    {
      id: 'rec-1',
      score: 99,
      title: 'Lemon',
      'artist-credit': [{ name: '米津玄師' }],
      'first-release-date': '2018-02-28',
      aliases: [{ name: 'レモン', locale: 'ja', primary: true }],
    },
  ],
});
assert(withInlineAliases?.songTitleJa === 'レモン', 'inline aliases in search parse');
assert(withInlineAliases?.recordingId === 'rec-1', 'recording id');

console.log('musicbrainz-recording-metadata.unit-test.ts: ok');
