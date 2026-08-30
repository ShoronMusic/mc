import assert from 'node:assert/strict';
import { directedMemberPair, memberHintsFromMusic8Members, shouldShowArtistMembersLine } from '@/lib/artist-members';

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
  console.log('artist-members.unit-test: ok');
}

run();
