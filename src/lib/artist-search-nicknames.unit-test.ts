import assert from 'node:assert/strict';
import {
  compactArtistSearchNicknameKey,
  expandArtistSearchNicknameVariants,
  listArtistSearchNicknameEntries,
  resolveArtistSearchNicknameCanonical,
} from '@/lib/artist-search-nicknames';
import { expandLibrarySearchQueryVariants } from '@/lib/library-search-query';

function run() {
  assert.equal(compactArtistSearchNicknameKey('ドリカム'), 'ドリカム');
  assert.equal(
    compactArtistSearchNicknameKey('ドリームズ・カム・トゥルー'),
    'ドリームズカムトゥルー',
  );

  assert.equal(resolveArtistSearchNicknameCanonical('ドリカム'), 'Dreams Come True');
  assert.equal(resolveArtistSearchNicknameCanonical('DCT'), 'Dreams Come True');
  assert.equal(
    resolveArtistSearchNicknameCanonical('ドリームズ・カム・トゥルー'),
    'Dreams Come True',
  );

  const dcts = expandArtistSearchNicknameVariants('ドリカム');
  assert.ok(dcts.includes('Dreams Come True'));
  assert.ok(dcts.some((x) => x.includes('ドリームズ')));

  const v = expandLibrarySearchQueryVariants('ドリカム');
  assert.ok(v.includes('ドリカム'));
  assert.ok(v.includes('Dreams Come True'));
  assert.ok(v.some((x) => /ドリームズ/.test(x)));

  assert.equal(resolveArtistSearchNicknameCanonical('ミスチル'), 'Mr.Children');
  assert.equal(resolveArtistSearchNicknameCanonical('ピンフロ'), 'Pink Floyd');
  assert.equal(resolveArtistSearchNicknameCanonical('レッチリ'), 'Red Hot Chili Peppers');
  assert.equal(resolveArtistSearchNicknameCanonical('ストーンズ'), 'The Rolling Stones');
  assert.equal(resolveArtistSearchNicknameCanonical('アクモン'), 'Arctic Monkeys');
  assert.equal(resolveArtistSearchNicknameCanonical('RATM'), 'Rage Against the Machine');
  assert.equal(resolveArtistSearchNicknameCanonical('マイケミ'), 'My Chemical Romance');
  assert.equal(resolveArtistSearchNicknameCanonical('バンタン'), 'BTS');
  assert.equal(resolveArtistSearchNicknameCanonical('ブルピン'), 'BLACKPINK');
  assert.equal(resolveArtistSearchNicknameCanonical('殿下'), 'Prince');
  assert.equal(resolveArtistSearchNicknameCanonical('マイコー'), 'Michael Jackson');
  assert.equal(resolveArtistSearchNicknameCanonical('RHCP'), 'Red Hot Chili Peppers');
  assert.equal(resolveArtistSearchNicknameCanonical('QOTSA'), 'Queens of the Stone Age');

  // クエリ全体一致のみ（部分一致しない）
  assert.equal(resolveArtistSearchNicknameCanonical('ドリカムの曲'), null);
  assert.equal(resolveArtistSearchNicknameCanonical('unknown-artist-xyz'), null);

  assert.ok(listArtistSearchNicknameEntries().some((e) => e.canonical === 'Dreams Come True'));
  assert.ok(listArtistSearchNicknameEntries().some((e) => e.canonical === 'Rage Against the Machine'));

  console.log('artist-search-nicknames.unit-test: ok');
}

run();
