import assert from 'node:assert/strict';
import {
  isSameSongForPick,
  isSameSongTitleForAiPick,
  matchesExcludedAiSongPick,
  matchesExcludedArtist,
  matchesExcludedUserSongArtistTitle,
  matchesExcludedUserSongPick,
  splitArtistTokens,
} from './character-song-pick-exclude';

assert.equal(isSameSongForPick('Oasis', 'Wonderwall', 'Oasis', 'Wonderwall'), true);
assert.equal(isSameSongForPick('Oasis', 'Wonderwall (Official Video)', 'Oasis', 'Wonderwall'), true);
assert.equal(isSameSongForPick('Blur', 'Song 2', 'Oasis', 'Wonderwall'), false);

const recent = [{ artist: 'Oasis', song: 'Wonderwall' }];
assert.equal(matchesExcludedUserSongPick('Oasis', 'Wonderwall', recent), true);
assert.equal(matchesExcludedUserSongPick('Oasis', 'Wonderwall (Remastered)', recent), true);
assert.equal(matchesExcludedUserSongPick('The Verve', 'Bitter Sweet Symphony', recent), false);
assert.equal(matchesExcludedUserSongArtistTitle('Oasis - Wonderwall', recent), true);
assert.equal(matchesExcludedUserSongArtistTitle('Blur - Song 2', recent), false);

const aiRecent = [
  { artist: 'Bill Withers', song: 'Lean On Me (BBC In Concert, May 11, 1974)' },
];
assert.equal(matchesExcludedAiSongPick('Bill Withers', 'Lean on Me', aiRecent), true);
assert.equal(matchesExcludedAiSongPick('Bill Withers', 'Lean On Me (Live)', aiRecent), true);
assert.equal(isSameSongTitleForAiPick("You've Got a Friend", "You've Got A Friend (from Welcome To My Living Room)"), true);
assert.equal(
  matchesExcludedAiSongPick('Carole King', "You've Got a Friend", [
    { artist: 'James Taylor, Carole King', song: "You've Got A Friend (BBC In Concert)" },
  ]),
  true,
);

assert.deepEqual(splitArtistTokens('James Taylor, Carole King'), ['James Taylor', 'Carole King']);
assert.equal(matchesExcludedArtist('Post Malone', ['Post Malone']), true);
assert.equal(matchesExcludedArtist('Post Malone, 21 Savage', ['Post Malone']), true);
assert.equal(matchesExcludedArtist('Drake', ['Post Malone']), false);

console.log('character-song-pick-exclude.unit-test.ts: ok');
