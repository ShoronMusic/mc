import assert from 'node:assert/strict';
import { directedMemberPair, guessHintLinkRole, memberHintsFromMusic8Members, shouldShowArtistMembersLine, splitMemberGraphIds, uniqueArtistIds } from '@/lib/artist-members';

function run() {
  const hints = memberHintsFromMusic8Members([
    { name: 'Andy Summers', slug: 'andy-summers' },
    { name: 'Sting', slug: 'sting' },
    { name: 'Stewart Copeland', slug: 'stewart-copeland' },
    { name: 'Sting', slug: 'sting' },
  ]);
  assert.equal(hints.length, 3);
  assert.equal(hints[0]?.slug, 'andy-summers');
  assert.equal(hints[1]?.name, 'Sting');
  assert.deepEqual(memberHintsFromMusic8Members(null), []);

  const police = { id: 'band', kind: 'band' };
  const sting = { id: 'sting', kind: 'singer, songwriter, musician' };
  assert.deepEqual(directedMemberPair(police, sting), {
    artist_id: 'band',
    member_artist_id: 'sting',
  });
  assert.deepEqual(directedMemberPair(sting, police), {
    artist_id: 'band',
    member_artist_id: 'sting',
  });
  assert.equal(directedMemberPair(sting, { id: 'andy', kind: 'guitarist' }), null);
  assert.equal(directedMemberPair({ id: 'virzha', kind: null }, sting), null);

  assert.equal(
    shouldShowArtistMembersLine({
      kind: 'singer, songwriter, musician',
      memberLinkCount: 0,
      bandLinkCount: 1,
      hasMembersFallback: true,
    }),
    false,
  );
  assert.equal(
    shouldShowArtistMembersLine({
      kind: 'band',
      memberLinkCount: 3,
      bandLinkCount: 0,
      hasMembersFallback: true,
    }),
    true,
  );
  assert.equal(
    shouldShowArtistMembersLine({
      kind: 'band',
      memberLinkCount: 0,
      bandLinkCount: 0,
      hasMembersFallback: true,
    }),
    true,
  );

  assert.equal(guessHintLinkRole('singer, songwriter', 'band'), 'band');
  assert.equal(guessHintLinkRole('band', 'singer, songwriter'), 'member');
  assert.equal(guessHintLinkRole('singer', 'guitarist'), 'unknown');

  const plant = '11111111-1111-1111-1111-111111111111';
  const zep = '22222222-2222-2222-2222-222222222222';
  const page = '33333333-3333-3333-3333-333333333333';
  const split = splitMemberGraphIds({
    selfId: plant,
    memberIds: [page, plant, page, 'not-a-uuid'],
    bandIds: [zep, page],
  });
  assert.deepEqual(split.overlap, [page]);
  assert.deepEqual(split.memberIds, []);
  assert.deepEqual(split.bandIds, [zep]);
  assert.deepEqual(uniqueArtistIds([zep, zep, plant], plant), [zep]);

  console.log('artist-members.unit-test: ok');
}

run();
