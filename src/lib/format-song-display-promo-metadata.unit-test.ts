import { shouldSkipAiCommentaryForPromotionalOrProseMetadata } from './format-song-display';

const prev = process.env.AI_COMMENTARY_SKIP_PROMO_METADATA;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

try {
  process.env.AI_COMMENTARY_SKIP_PROMO_METADATA = undefined;

  assert(
    shouldSkipAiCommentaryForPromotionalOrProseMetadata({
      rawYouTubeTitle:
        'Stream the, professionally mixed audio of the full show in the nugs app. CDs and Hi.',
      song: 'Stream the, professionally mixed audio of the full show in the nugs app.',
      snippetDescription: null,
    }),
    'nugs / professionally mixed promo title should skip',
  );

  assert(
    shouldSkipAiCommentaryForPromotionalOrProseMetadata({
      rawYouTubeTitle: 'a'.repeat(145),
      song: 'Short',
      snippetDescription: null,
    }),
    'very long raw title should skip',
  );

  assert(
    !shouldSkipAiCommentaryForPromotionalOrProseMetadata({
      rawYouTubeTitle: 'Bruce Springsteen - Purple Rain (Live From Minneapolis)',
      song: 'Purple Rain',
      snippetDescription: null,
    }),
    'normal live title should not skip',
  );

  assert(
    !shouldSkipAiCommentaryForPromotionalOrProseMetadata({
      rawYouTubeTitle: 'Oasis - Wonderwall (Official Video)',
      song: 'Wonderwall',
      snippetDescription: null,
    }),
    'short official video title should not skip',
  );

  process.env.AI_COMMENTARY_SKIP_PROMO_METADATA = '0';
  assert(
    !shouldSkipAiCommentaryForPromotionalOrProseMetadata({
      rawYouTubeTitle: 'Stream the nugs app promo text here professionally mixed',
      song: 'x',
      snippetDescription: null,
    }),
    'AI_COMMENTARY_SKIP_PROMO_METADATA=0 disables skip',
  );
} finally {
  process.env.AI_COMMENTARY_SKIP_PROMO_METADATA = prev;
}

console.log('format-song-display-promo-metadata unit tests: OK');
