/**
 * `npx tsx src/lib/commentary-youtube-facts.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  artistCreditHasNamedFeatured,
  buildYoutubeMetadataFactsBlock,
  COMMENTARY_ARTIST_KNOWLEDGE_RULES,
  isDjCenteredCatalogStyle,
  sanitizeYoutubeDescriptionForCommentary,
  shouldMentionVocalGenderInProse,
} from '@/lib/commentary-youtube-facts';

const cleaned = sanitizeYoutubeDescriptionForCommentary(
  [
    'GOOD IN GOODBYE is out now. One of the most emotional songs we have ever written.',
    'https://www.youtube.com/watch?v=vQP3EZthSj4',
    'Subscribe to our channel!',
    '#kissindynamite #goodingoodbye #hardrock #metal #arena #glam #single #official',
  ].join('\n'),
);
assert.ok(cleaned.includes('most emotional songs'));
assert.equal(cleaned.includes('https://'), false);
assert.equal(/subscribe/i.test(cleaned), false);

const block = buildYoutubeMetadataFactsBlock({
  description: 'A German hard rock ballad about farewells.',
  publishedAt: '2026-09-02T16:00:22Z',
  channelTitle: 'Kissin Dynamite',
});
assert.ok(block.includes('【YouTube メタデータ】'));
assert.ok(block.includes('Kissin Dynamite'));
assert.ok(block.includes('2026-09-02'));
assert.ok(block.includes('hard rock ballad'));
assert.equal(buildYoutubeMetadataFactsBlock({}), '');
assert.ok(COMMENTARY_ARTIST_KNOWLEDGE_RULES.includes('スタジアムロック'));
assert.ok(COMMENTARY_ARTIST_KNOWLEDGE_RULES.includes('シンセ'));
assert.ok(COMMENTARY_ARTIST_KNOWLEDGE_RULES.includes('男性ボーカル'));
assert.ok(COMMENTARY_ARTIST_KNOWLEDGE_RULES.includes('フィーチャー名が無い'));
assert.ok(COMMENTARY_ARTIST_KNOWLEDGE_RULES.includes('バラード'));

assert.equal(isDjCenteredCatalogStyle('Electronica'), true);
assert.equal(isDjCenteredCatalogStyle('Metal'), false);
assert.equal(artistCreditHasNamedFeatured('Calvin Harris, Dua Lipa'), true);
assert.equal(artistCreditHasNamedFeatured('Calvin Harris'), false);
assert.equal(artistCreditHasNamedFeatured('Earth, Wind & Fire'), false);
assert.equal(artistCreditHasNamedFeatured('Avicii feat. Aloe Blacc'), true);
assert.equal(
  shouldMentionVocalGenderInProse({ style: 'Electronica', artistDisplay: 'Avicii' }),
  true,
);
assert.equal(
  shouldMentionVocalGenderInProse({
    style: 'Electronica',
    hasNamedFeaturedArtist: true,
  }),
  false,
);
assert.equal(
  shouldMentionVocalGenderInProse({ style: 'Metal', artistDisplay: "Kissin' Dynamite" }),
  false,
);

console.log('commentary-youtube-facts.unit-test: ok');
