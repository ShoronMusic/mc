/**
 * `npx tsx src/lib/musicbrainz-commentary-facts.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  extractReleaseGroupsFromRecordingSearch,
  filterReleaseGroupsForCommentary,
  formatMusicBrainzFactsBlock,
  sortReleaseGroupsForCommentary,
} from './musicbrainz-commentary-facts';

const searchSnippet = {
  recordings: [
    {
      score: 100,
      releases: [
        {
          status: 'Official',
          date: '1996',
          title: 'Hits',
          'release-group': {
            id: 'rg-comp',
            title: 'Greatest Hits',
            'primary-type': 'Album',
            'secondary-types': ['Compilation'],
            'first-release-date': '1996',
          },
        },
        {
          status: 'Official',
          date: '1984',
          title: 'Extra Play',
          'release-group': {
            id: 'rg-studio',
            title: 'Extra Play',
            'primary-type': 'Album',
            'secondary-types': [],
            'first-release-date': '1984',
          },
        },
        {
          status: 'Official',
          date: '1983',
          title: 'Big Apple',
          'release-group': {
            id: 'rg-single',
            title: 'Big Apple',
            'primary-type': 'Single',
            'secondary-types': [],
            'first-release-date': '1983',
          },
        },
      ],
    },
  ],
};

const extracted = extractReleaseGroupsFromRecordingSearch(searchSnippet);
assert.equal(extracted.length, 3);

const filtered = filterReleaseGroupsForCommentary(extracted);
assert.equal(filtered.length, 2);
assert.ok(filtered.every((g) => !g.secondaryTypes.includes('Compilation')));

const sorted = sortReleaseGroupsForCommentary(filtered);
assert.equal(sorted[0].primaryType, 'Album');
assert.equal(sorted[1].primaryType, 'Single');

const block = formatMusicBrainzFactsBlock(sorted);
assert.ok(block?.includes('アルバム『Extra Play』'));
assert.ok(block?.includes('シングル『Big Apple』'));
assert.ok(block?.includes('MusicBrainz'));

console.log('musicbrainz-commentary-facts unit tests: OK');
