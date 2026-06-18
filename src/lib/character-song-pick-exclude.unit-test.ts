import assert from 'node:assert/strict';
import {
  isSameSongForPick,
  matchesExcludedUserSongArtistTitle,
  matchesExcludedUserSongPick,
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

console.log('character-song-pick-exclude.unit-test.ts: ok');
