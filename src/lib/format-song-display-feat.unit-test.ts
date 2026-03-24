/**
 * FEAT_SEPARATOR が曲名中の「With」を共演区切りと誤認しないことの検証。
 * `npx tsx src/lib/format-song-display-feat.unit-test.ts` / `npm run test:format`
 */
import assert from 'node:assert/strict';
import {
  cleanTitle,
  getAmbiguousTitleSegmentsForMusicBrainz,
  getArtistAndSong,
  getArtistDisplayString,
  getMainArtist,
} from './format-song-display';
import { reapplyCommentaryLibraryBodyPrefix } from './commentary-library';
import { compoundArtistCanonicalIfKnown } from './artist-compound-names';

assert.equal(compoundArtistCanonicalIfKnown('Hall & Oates'), 'Daryl Hall & John Oates');
assert.equal(compoundArtistCanonicalIfKnown('Hall and Oates'), 'Daryl Hall & John Oates');

assert.equal(getMainArtist('Die With A Smile'), 'Die With A Smile');
assert.equal(getArtistDisplayString('Die With A Smile'), 'Die With A Smile');

assert.equal(getMainArtist('Be With You'), 'Be With You');

assert.equal(getMainArtist('Drake ft. Rihanna'), 'Drake');
assert.equal(getArtistDisplayString('Drake ft. Rihanna'), 'Drake, Rihanna');

// 「曲名 - 単語バンド名」の逆順（YouTube タイトルで多い）
{
  const r = getArtistAndSong('Too Shy - Kajagoogoo', 'Some Unrelated Channel');
  assert.equal(r.artistDisplay, 'Kajagoogoo');
  assert.equal(r.song, 'Too Shy');
}

// 正しい「単語バンド名 - 複語曲名」はチャンネル不一致でもスワップしない
{
  const r = getArtistAndSong('Kajagoogoo - Too Shy', 'Some Unrelated Channel');
  assert.equal(r.artistDisplay, 'Kajagoogoo');
  assert.equal(r.song, 'Too Shy');
}

// 正しい「アーティスト - 曲名」はそのまま（各語4文字以上の複語アーティスト）
{
  const r = getArtistAndSong('John Lennon - Imagine', null);
  assert.equal(r.artistDisplay, 'John Lennon');
  assert.equal(r.song, 'Imagine');
}

{
  const body = 'Too Shy - Kajagoogoo\n\n80年代のポップの話。';
  const out = reapplyCommentaryLibraryBodyPrefix(body, 'Kajagoogoo', 'Too Shy', null);
  assert.ok(out.startsWith('Kajagoogoo - Too Shy\n\n'));
  assert.ok(out.includes('80年代のポップ'));
}

assert.equal(cleanTitle('Big Apple (2004 Remaster)').includes('Remaster'), false);

assert.equal(cleanTitle('What Is Love • TopPop'), 'What Is Love');

{
  const r = getArtistAndSong('Howard Jones - What Is Love • TopPop', null);
  assert.equal(r.artistDisplay, 'Howard Jones');
  assert.equal(r.song, 'What Is Love');
}

{
  const r = getArtistAndSong('a - ha - Take On Me', null);
  assert.equal(r.artistDisplay, 'a-ha');
  assert.equal(r.song, 'Take On Me');
}
{
  const r = getArtistAndSong('a-ha - Take On Me', null);
  assert.equal(r.artistDisplay, 'a-ha');
  assert.equal(r.song, 'Take On Me');
}

// 「A & B - 曲名」は MB 順序推定を掛けない（片側だけ & のデュオ名と誤判定を防ぐ）
{
  const amb = getAmbiguousTitleSegmentsForMusicBrainz(
    'Daryl Hall & John Oates - Maneater (Official Video)',
    'Totally Unrelated Upload Channel',
    null,
  );
  assert.equal(amb, null);
}
{
  const r = getArtistAndSong(
    'Daryl Hall & John Oates - Maneater (Official Video)',
    'Totally Unrelated Upload Channel',
  );
  assert.equal(r.artistDisplay, 'Daryl Hall & John Oates');
  assert.equal(r.song, 'Maneater');
}
// 逆順タイトルはスワップで救う
{
  const r = getArtistAndSong('Maneater - Daryl Hall & John Oates', 'Totally Unrelated Upload Channel');
  assert.equal(r.artistDisplay, 'Daryl Hall & John Oates');
  assert.equal(r.song, 'Maneater');
}

console.log('format-song-display feat separator unit tests: OK');
