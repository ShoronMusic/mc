import {
  buildSongDbRegistrationInput,
  shouldPersistVideoToSongDatabase,
  YOUTUBE_CATEGORY_FILM_ANIMATION,
  YOUTUBE_CATEGORY_GAMING,
  YOUTUBE_CATEGORY_MUSIC,
} from './song-db-registration-gate';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(
  shouldPersistVideoToSongDatabase(
    buildSongDbRegistrationInput({
      rawTitle: 'The Beatles - Hey Jude (Official Music Video)',
      categoryId: YOUTUBE_CATEGORY_MUSIC,
    }),
  ).persist,
  'music category',
);

assert(
  !shouldPersistVideoToSongDatabase(
    buildSongDbRegistrationInput({
      rawTitle: 'Dune: Part Two | Official Trailer',
      categoryId: YOUTUBE_CATEGORY_FILM_ANIMATION,
    }),
  ).persist,
  'movie trailer',
);

assert(
  !shouldPersistVideoToSongDatabase(
    buildSongDbRegistrationInput({
      rawTitle: 'ゼルダの伝説 ティアーズ オブ ザ キングダム 実況 #1',
      categoryId: YOUTUBE_CATEGORY_GAMING,
    }),
  ).persist,
  'gameplay jp',
);

assert(
  shouldPersistVideoToSongDatabase(
    buildSongDbRegistrationInput({
      rawTitle: 'Some Movie Scene',
      hasMusic8Match: true,
    }),
  ).persist,
  'music8 override',
);

assert(
  !shouldPersistVideoToSongDatabase(
    buildSongDbRegistrationInput({
      rawTitle: '米津玄師 - Lemon',
      channelTitle: 'ファン投稿チャンネル',
      isJapaneseDomestic: true,
      hasMusic8Match: true,
    }),
  ).persist,
  'jp domestic ignores music8 bypass',
);

assert(
  shouldPersistVideoToSongDatabase(
    buildSongDbRegistrationInput({
      rawTitle: 'Arctic Monkeys - Do I Wanna Know? (Official Video)',
      channelTitle: 'Arctic Monkeys',
    }),
  ).persist,
  'artist dash song',
);

assert(
  !shouldPersistVideoToSongDatabase(
    buildSongDbRegistrationInput({
      rawTitle: '今日のニュースまとめ 2026年4月',
      channelTitle: 'News Channel',
    }),
  ).persist,
  'news',
);

assert(
  !shouldPersistVideoToSongDatabase(
    buildSongDbRegistrationInput({
      rawTitle: '米津玄師 - Lemon',
      channelTitle: 'ファン投稿チャンネル',
      isJapaneseDomestic: true,
    }),
  ).persist,
  'jp unofficial fan upload',
);

assert(
  shouldPersistVideoToSongDatabase(
    buildSongDbRegistrationInput({
      rawTitle: 'ONE OK ROCK - Wherever you are',
      channelId: 'UCzycs8MqvIY4nXWwS-v4J9g',
      isJapaneseDomestic: true,
    }),
  ).persist,
  'jp official channel whitelist',
);

assert(
  shouldPersistVideoToSongDatabase(
    buildSongDbRegistrationInput({
      rawTitle: 'サカナクション / 夜の踊り子 -Music Video-',
      channelTitle: 'サカナクション sakanaction',
      channelAuthorName: 'サカナクション sakanaction',
      isJapaneseDomestic: true,
    }),
  ).persist,
  'jp slash mv on artist channel',
);

assert(
  shouldPersistVideoToSongDatabase(
    buildSongDbRegistrationInput({
      rawTitle: '米津玄師 - 烏 Kenshi Yonezu - Karasu',
      channelTitle: 'Kenshi Yonezu 米津玄師',
      channelAuthorName: 'Kenshi Yonezu 米津玄師',
      isJapaneseDomestic: true,
    }),
  ).persist,
  'jp bilingual hyphen on artist channel',
);

console.log('song-db-registration-gate.unit-test.ts: ok');
