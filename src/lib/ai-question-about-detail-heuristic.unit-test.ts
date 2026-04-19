import assert from 'node:assert/strict';
import {
  isAboutDetailMusicFollowupQuestion,
  isOutlineTeachMusicFollowupQuestion,
  isOffTopicAboutSubject,
  isMusicLikelyKatakanaOrLatinWithStrongAnchors,
  isShortMusicBiographyFollowupQuestion,
  parseAboutDetailQuestionSubject,
  parseOutlineTeachSubject,
  recentMessagesSuggestMusicRoomContext,
  shouldShortCircuitSongRequestForAtPrompt,
} from './ai-question-about-detail-heuristic';

const musicCtxRecent = [{ messageType: 'ai', body: 'AI[DB] 曲解説…' }];

assert.equal(
  isAboutDetailMusicFollowupQuestion('DragonForceについて詳しく教えて', musicCtxRecent),
  true
);
assert.equal(
  isAboutDetailMusicFollowupQuestion('The Beatlesについて教えて', musicCtxRecent),
  true
);
assert.equal(
  isAboutDetailMusicFollowupQuestion(
    'Alissa White-Gluzについてついて詳しく教えて',
    musicCtxRecent
  ),
  true
);

assert.equal(
  isAboutDetailMusicFollowupQuestion('DragonForceについて詳しく教えて', [
    { messageType: 'user', body: 'こんにちは' },
  ]),
  false
);

assert.equal(
  isAboutDetailMusicFollowupQuestion('DragonForceについて詳しく教えて', [
    { messageType: 'user', body: 'https://www.youtube.com/watch?v=abc' },
  ]),
  true
);
assert.equal(
  isAboutDetailMusicFollowupQuestion('DragonForceについて詳しく教えて', [
    { messageType: 'user', body: 'https://youtu.be/abc' },
  ]),
  true
);
assert.equal(
  isAboutDetailMusicFollowupQuestion('DragonForceについて詳しく教えて', [
    { messageType: 'user', body: '本文に[DB]が含まれる' },
  ]),
  true
);

assert.equal(
  isAboutDetailMusicFollowupQuestion('政治について詳しく教えて', musicCtxRecent),
  false
);
assert.equal(isOffTopicAboutSubject('政治'), true);
assert.equal(isOffTopicAboutSubject('DragonForce'), false);

assert.equal(parseAboutDetailQuestionSubject('DragonForceについて詳しく教えて'), 'DragonForce');
assert.equal(parseAboutDetailQuestionSubject('DragonForceについて教えて？'), 'DragonForce');
assert.equal(parseAboutDetailQuestionSubject('Foo について　教えてください'), 'Foo');
assert.equal(parseAboutDetailQuestionSubject('no match'), null);

assert.equal(parseOutlineTeachSubject('ドラフォの概要教えて？'), 'ドラフォ');
assert.equal(parseOutlineTeachSubject('DragonForceの概要を教えて'), 'DragonForce');
assert.equal(parseOutlineTeachSubject('Queenの活動を知りたい'), 'Queen');
assert.equal(parseOutlineTeachSubject('Oasisの遍歴聞かせて'), 'Oasis');
assert.equal(parseOutlineTeachSubject('Radioheadのギター教えて'), 'Radiohead');
assert.equal(parseOutlineTeachSubject('Metallicaのvocalist教えて'), 'Metallica');
assert.equal(parseOutlineTeachSubject('Queenのフロントマンを知りたい'), 'Queen');
assert.equal(parseOutlineTeachSubject('Oasisのリーダー教えて？'), 'Oasis');
assert.equal(parseOutlineTeachSubject('ディランの現在は？'), 'ディラン');
assert.equal(parseOutlineTeachSubject('Queenの近況は'), 'Queen');
assert.equal(
  parseOutlineTeachSubject('ホワイトスネイクは今、活動しているの？'),
  'ホワイトスネイク'
);
assert.equal(parseOutlineTeachSubject('Queenはまだ活動してる？'), 'Queen');
assert.equal(isOutlineTeachMusicFollowupQuestion('ドラフォの概要教えて？', musicCtxRecent), true);
assert.equal(
  isOutlineTeachMusicFollowupQuestion('ドラフォの概要教えて？', [{ messageType: 'user', body: 'a' }]),
  false
);
assert.equal(isOutlineTeachMusicFollowupQuestion('政治の概要教えて', musicCtxRecent), false);
assert.equal(isOutlineTeachMusicFollowupQuestion('ディランの現在は？', musicCtxRecent), true);
assert.equal(
  isOutlineTeachMusicFollowupQuestion('ホワイトスネイクは今、活動しているの？', musicCtxRecent),
  true
);
assert.equal(
  parseOutlineTeachSubject('MadonnaのHung Upのダンスのスタイルは？'),
  'MadonnaのHung Up'
);
assert.equal(
  isOutlineTeachMusicFollowupQuestion('MadonnaのHung Upのダンスのスタイルは？', musicCtxRecent),
  true
);

assert.equal(recentMessagesSuggestMusicRoomContext([{ messageType: 'user', body: 'a' }]), false);
assert.equal(recentMessagesSuggestMusicRoomContext([{ messageType: 'ai', body: '' }]), true);

assert.equal(shouldShortCircuitSongRequestForAtPrompt('ドラフォの概要教えて？'), true);
assert.equal(shouldShortCircuitSongRequestForAtPrompt('DragonForceについて教えて'), true);
assert.equal(shouldShortCircuitSongRequestForAtPrompt('Through the Fireをかけて'), false);
assert.equal(shouldShortCircuitSongRequestForAtPrompt('ディランの現在は？'), true);

assert.equal(isShortMusicBiographyFollowupQuestion('出身地です', musicCtxRecent), true);
assert.equal(isShortMusicBiographyFollowupQuestion('生まれは？', musicCtxRecent), true);
assert.equal(isShortMusicBiographyFollowupQuestion('出身地です', [{ messageType: 'user', body: 'hi' }]), false);
assert.equal(shouldShortCircuitSongRequestForAtPrompt('出身地です', musicCtxRecent), true);
assert.equal(shouldShortCircuitSongRequestForAtPrompt('出身地です'), false);

assert.equal(
  isMusicLikelyKatakanaOrLatinWithStrongAnchors('メタリカの活動教えて', musicCtxRecent),
  true
);
assert.equal(
  isMusicLikelyKatakanaOrLatinWithStrongAnchors('アメリカについて教えて', musicCtxRecent),
  false
);
assert.equal(
  isMusicLikelyKatakanaOrLatinWithStrongAnchors('Whitesnakeの活動は？', musicCtxRecent),
  true
);

console.log('ai-question-about-detail-heuristic unit tests: OK');
