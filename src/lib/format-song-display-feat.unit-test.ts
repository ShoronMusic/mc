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
  parsePerformingFromDescription,
} from './format-song-display';
import { reapplyCommentaryLibraryBodyPrefix } from './commentary-library';
import { compoundArtistCanonicalIfKnown } from './artist-compound-names';
import { resolveArtistSongForPack } from './youtube-artist-song-for-pack';

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

assert.ok(
  cleanTitle('Big Apple (2004 Remaster)').includes('Remaster'),
  'Remaster は楽曲バージョンとして残す',
);

assert.equal(
  cleanTitle('Family Affair (Spanish Fly Remix)'),
  'Family Affair (Spanish Fly Remix)',
  '名前付きリミックス括弧は曲名の一部として残す',
);
assert.equal(cleanTitle('Song (Remix)'), 'Song (Remix)', '(Remix) は残す');
assert.equal(cleanTitle('Song (Official Remix)'), 'Song (Official Remix)', 'Official Remix も残す');
assert.equal(cleanTitle('Song (Extended Remix)'), 'Song (Extended Remix)', 'Extended Remix も残す');

{
  const r = getArtistAndSong('Mary J. Blige - Family Affair (Spanish Fly Remix)', 'Mary J. Blige');
  assert.match(r.song, /Spanish Fly Remix/);
}

assert.equal(cleanTitle('What Is Love • TopPop'), 'What Is Love');

assert.equal(cleanTitle('Mr. Roboto. (C) 1983 A&M Records'), 'Mr. Roboto.');
assert.equal(cleanTitle('Foo © 1999 Some Label LLC'), 'Foo');
{
  const r = getArtistAndSong('Styx - Mr. Roboto. (C) 1983 A&M Records', 'StyxVEVO');
  assert.equal(r.artistDisplay, 'Styx');
  assert.equal(r.song, 'Mr. Roboto.');
}

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

// クォート曲名の後ろに Official MV / Choreography などが続いても抽出できる
{
  const r = getArtistAndSong(
    "BTS (방탄소년단) 'Dynamite' Official MV (Choreography ver.)",
    'HYBE LABELS',
  );
  assert.equal(r.artistDisplay, 'BTS (방탄소년단)');
  assert.equal(r.song, 'Dynamite');
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

// 「Mr.」等の省略形のピリオドで曲名が切れない（概要の performing 行）
{
  const desc = 'Music video by Styx performing Mr. Roboto.\n\nMore';
  assert.deepEqual(parsePerformingFromDescription(desc), { artist: 'Styx', song: 'Mr. Roboto' });
  const r = getArtistAndSong('Styx - Mr. Roboto (Official Video)', 'StyxVEVO', { videoDescription: desc });
  assert.equal(r.artistDisplay, 'Styx');
  assert.equal(r.song, 'Mr. Roboto');
}

// 概要の performing が逆でも、合体アーティスト名が曲列に来ていれば補正
{
  const desc = 'Music video by Maneater performing Daryl Hall & John Oates\n\nMore';
  const r = getArtistAndSong(
    'Daryl Hall & John Oates - Maneater (Official Video)',
    'Unrelated Channel',
    { videoDescription: desc },
  );
  assert.equal(r.artistDisplay, 'Daryl Hall & John Oates');
  assert.equal(r.song, 'Maneater');
}

// 左に「A & B」がある公式タイトルに対し、誤った performing（曲名とアーティストが入れ替わり）を無視する
{
  const title =
    'David Bowie & Pat Metheny Group - This Is Not America (official video reworked)';
  const desc =
    'Music video by This Is Not America performing David Bowie & Pat Metheny Group.\n© 1985';
  const r = getArtistAndSong(title, 'Weird Channel', { videoDescription: desc });
  assert.equal(r.artistDisplay, 'David Bowie, Pat Metheny Group');
  assert.equal(r.song, 'This Is Not America');
}
{
  const desc = 'Music video by Maneater performing Daryl Hall & John Oates\n\nMore';
  const r = resolveArtistSongForPack('Daryl Hall & John Oates - Maneater (Official Video)', 'Unrelated', {
    title: 'Daryl Hall & John Oates - Maneater (Official Video)',
    description: desc,
    channelTitle: 'Unrelated',
  });
  assert.equal(r.artistDisplay, 'Daryl Hall & John Oates');
  assert.equal(r.song, 'Maneater');
}

// 公式MVで多い「曲名 - Linkin Park X Steve Aoki」（X コラボは & / and と同様に逆順の手がかり）
{
  const r = getArtistAndSong(
    'A Light That Never Comes [Official Music Video] - Linkin Park X Steve Aoki',
    null,
  );
  assert.equal(r.artistDisplay, 'Linkin Park X Steve Aoki');
  assert.ok(r.song.includes('A Light That Never Comes'));
}
// YouTube タイトルが全角ハイフン（U+FF0D）のときも分割して同様にスワップ
{
  const r = getArtistAndSong(
    'A Light That Never Comes [Official Music Video] － Linkin Park X Steve Aoki',
    null,
  );
  assert.equal(r.artistDisplay, 'Linkin Park X Steve Aoki');
  assert.ok(r.song.includes('A Light That Never Comes'));
}

console.log('format-song-display feat separator unit tests: OK');

// 「Paramore - Paramore: Hard Times」のような二重アーティスト表記を落とす
{
  const r = getArtistAndSong('Paramore - Paramore: Hard Times', null);
  assert.equal(r.artistDisplay, 'Paramore');
  assert.equal(r.song, 'Hard Times');
}
