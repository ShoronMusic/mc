/**
 * npx tsx src/lib/admin-song-artist-links.unit-test.ts
 */
import assert from 'node:assert/strict';
import {
  adminSongArtistCreditsMissingLead,
  isCombinedCollabArtistLabel,
  mergeAdminSongArtistLinks,
  orderedAdminSongArtistNames,
} from '@/lib/admin-song-artist-links';

const weeknd = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'The Weeknd',
  spotifyArtistId: '1Xyo4u8uXC1ZmMpatF05PJ',
};
const ariana = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Ariana Grande',
  spotifyArtistId: '66CXWjxzNUsdJxJ2JdwvnR',
};

const merged = mergeAdminSongArtistLinks({
  primary: weeknd,
  credits: [ariana],
});
assert.equal(merged.length, 2);
assert.equal(merged[0]?.name, 'The Weeknd');
assert.equal(merged[0]?.kind, 'main');
assert.equal(merged[1]?.name, 'Ariana Grande');
assert.equal(merged[1]?.kind, 'credit');

const primaryAlsoInCredits = mergeAdminSongArtistLinks({
  primary: weeknd,
  credits: [weeknd, ariana],
});
assert.equal(primaryAlsoInCredits.length, 2);
assert.equal(primaryAlsoInCredits[0]?.kind, 'main');

assert.equal(
  mergeAdminSongArtistLinks({
    primary: null,
    credits: [ariana],
  }).length,
  1,
);

assert.equal(
  mergeAdminSongArtistLinks({
    primary: { id: '  ', name: 'X' },
    credits: [],
  }).length,
  0,
);

const wrongPrimary = mergeAdminSongArtistLinks({
  orderedNames: ['The Weeknd', 'Ariana Grande'],
  primary: ariana,
  credits: [ariana],
  extra: [weeknd],
});
assert.deepEqual(
  wrongPrimary.map((a) => `${a.name}:${a.kind}`),
  ['The Weeknd:main', 'Ariana Grande:credit'],
);

const unresolvedLead = mergeAdminSongArtistLinks({
  orderedNames: ['The Weeknd', 'Ariana Grande'],
  primary: ariana,
  credits: [ariana],
});
assert.equal(unresolvedLead[0]?.name, 'The Weeknd');
assert.equal(unresolvedLead[0]?.kind, 'main');
assert.equal(unresolvedLead[0]?.unresolved, true);
assert.equal(unresolvedLead[1]?.name, 'Ariana Grande');
assert.equal(unresolvedLead[1]?.kind, 'credit');
assert.equal(unresolvedLead[1]?.unresolved, false);

assert.equal(
  isCombinedCollabArtistLabel('The Weeknd, Ariana Grande', ['The Weeknd', 'Ariana Grande']),
  true,
);
assert.equal(isCombinedCollabArtistLabel('Ariana Grande', ['The Weeknd', 'Ariana Grande']), false);

assert.deepEqual(
  orderedAdminSongArtistNames({
    spotifyArtists: 'The Weeknd, Ariana Grande',
    mainArtist: 'The Weeknd, Ariana Grande',
  }),
  ['The Weeknd', 'Ariana Grande'],
);

assert.equal(
  adminSongArtistCreditsMissingLead(['The Weeknd', 'Ariana Grande'], [{ artistName: 'Ariana Grande' }]),
  true,
);
assert.equal(
  adminSongArtistCreditsMissingLead(['The Weeknd', 'Ariana Grande'], [{ artistName: 'The Weeknd' }]),
  false,
);

console.log('admin-song-artist-links.unit-test: ok');
