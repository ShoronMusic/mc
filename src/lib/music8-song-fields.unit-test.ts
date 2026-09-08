import assert from 'node:assert/strict';
import {
  extractMusic8SongFields,
  extractMusic8SongFieldsFromPersistedSnapshot,
  parseMusicaichatStructuredMetadataFromFactsText,
  pickMusic8SongFullDescription,
  music8HtmlOrTextToPlain,
  plainMusic8IntroFromWpSongJson,
  stripLeadingMusic8CreditLine,
  resolveOriginalReleaseDateFromMusic8Json,
  resolveOriginalReleaseDateFromMusic8WpSongsFileJson,
  resolveSongStyleForOverwriteFromMusic8,
  wordpressPublishDateToPostgresDate,
} from '@/lib/music8-song-fields';

function run() {
  const p = parseMusicaichatStructuredMetadataFromFactsText('ボーカル： lead\nスタイル： Rock\n');
  assert.equal(p.vocalLabel, 'lead');
  assert.equal(p.structuredStyleFromFacts, 'Rock');

  const ex = extractMusic8SongFields({
    stable_key: { artist_slug: 'x', song_slug: 'y' },
    classification: ['New wave', 'Soft rock'],
    styles: [6409],
    releases: { original_release_date: '1983-06-01' },
    display: { primary_artist_name_ja: 'ポリス' },
  });
  assert.equal(ex.primaryArtistNameJa, 'ポリス');
  assert.equal(resolveSongStyleForOverwriteFromMusic8(ex), 'Metal');

  const exFacts = extractMusic8SongFields({
    stable_key: { artist_slug: 'x', song_slug: 'y' },
    classification: ['A', 'B'],
    facts_for_ai: { opening_lines: ['スタイル: Synth-pop'] },
  });
  assert.equal(resolveSongStyleForOverwriteFromMusic8(exFacts), 'Synth-pop');

  const exIdBeatsFacts = extractMusic8SongFields({
    stable_key: { artist_slug: 'police', song_slug: 'every-breath-you-take' },
    styles: [2849],
    facts_for_ai: { opening_lines: ['スタイル: Metal'] },
    classification: ['New wave', 'Soft rock'],
  });
  assert.equal(resolveSongStyleForOverwriteFromMusic8(exIdBeatsFacts), 'Rock');

  const snap = {
    kind: 'musicaichat_v1' as const,
    genres: ['G1'],
    styleNames: ['S1'],
    styleIds: [],
    releaseDate_normalized: '1999.01',
    vocal: 'V',
    structured_style: 'Alt',
    primary_artist_name_ja: '名',
  };
  const back = extractMusic8SongFieldsFromPersistedSnapshot(snap);
  assert.ok(back);
  assert.equal(back!.vocalLabel, 'V');
  assert.equal(back!.structuredStyleFromFacts, 'Alt');
  assert.equal(back!.primaryArtistNameJa, '名');

  const fromVocalsArray = extractMusic8SongFields({
    title: 'Fragile',
    vocals: [{ name: 'M', slug: 'male' }],
    content: '<p>hello</p>',
  });
  assert.equal(fromVocalsArray.vocalLabel, 'M');

  const fromBothVocals = extractMusic8SongFields({
    vocal_data: [{ name: 'F', slug: 'female' }],
    vocals: [{ name: 'M', slug: 'male' }],
  });
  assert.equal(fromBothVocals.vocalLabel, 'F, M');

  assert.equal(wordpressPublishDateToPostgresDate('2012-11-01T15:43:00'), '2012-11-01');
  assert.equal(
    resolveOriginalReleaseDateFromMusic8Json({
      id: 133101,
      date: '2012-11-01T15:43:00',
      acf: { spotify_release_date: '2003-10-28' },
    }),
    '2012-11-01',
  );

  assert.equal(
    resolveOriginalReleaseDateFromMusic8WpSongsFileJson({
      id: 6382,
      releaseDate: '1996-02-19T16:45:00',
      acf: { spotify_release_date: '2010' },
    }),
    '1996-02-19',
  );

  const excerptOnly = pickMusic8SongFullDescription({
    stable_key: { artist_slug: 'sting', song_slug: 'fortress-around-your-heart' },
    facts_for_ai: {
      opening_lines: [
        'ジャンル： New wave',
        'ソロデビューアルバム収録のシングルで、「要塞」...',
      ],
    },
  });
  assert.ok(excerptOnly.includes('ソロデビュー'));
  assert.ok(!excerptOnly.includes('ジャンル：'));

  const fullFromWp = pickMusic8SongFullDescription({
    content:
      '<p>短い全文。</p>',
    facts_for_ai: {
      opening_lines: [
        '長い抜粋の本文が続いて「要塞」...',
      ],
    },
    stable_key: { artist_slug: 'sting', song_slug: 'fortress-around-your-heart' },
  });
  assert.equal(fullFromWp, '短い全文。');
  assert.equal(music8HtmlOrTextToPlain('<p>hello</p><p>world</p>'), 'hello\nworld');
  assert.equal(music8HtmlOrTextToPlain('<p>一行<br />二行</p>'), '一行\n二行');
  assert.equal(
    stripLeadingMusic8CreditLine('2Pac - Dear Mama\n母親へ捧げたシングル。'),
    '母親へ捧げたシングル。',
  );
  assert.equal(
    plainMusic8IntroFromWpSongJson({
      title: 'All My Demons Greeting Me As A Friend',
      artists: [{ name: 'AURORA' }],
      content: '<p>ノルウェー出身AURORAの代表作。闇を突き抜ける。</p>',
    }),
    'ノルウェー出身AURORAの代表作。闇を突き抜ける。',
  );
  assert.equal(
    plainMusic8IntroFromWpSongJson({
      title: 'Dear Mama',
      artists: [{ name: '2Pac' }],
      content:
        '<p>2Pac - Dear Mama</p>\n<p>アメリカのラッパー2Pacが1995年2月21日、3rdアルバムからのリードシングルとして発表。</p>',
    }),
    'アメリカのラッパー2Pacが1995年2月21日、3rdアルバムからのリードシングルとして発表。',
  );
  assert.equal(
    plainMusic8IntroFromWpSongJson({
      title: 'Song',
      artists: [{ name: 'Artist' }],
      content: '<p>Artist - Song</p>',
    }),
    '',
  );
  assert.equal(
    plainMusic8IntroFromWpSongJson({
      title: 'Here For You',
      artists: [{ name: 'Wilkinson' }],
      content: '<p>Wilkinson&BeckyHill-HereForYou</p>',
    }),
    '',
  );

  assert.equal(
    plainMusic8IntroFromWpSongJson({
      title: "She's American",
      artists: [{ name: 'The 1975' }],
      content: "<p>The 1975 -She's American</p>",
    }),
    '',
  );

  assert.equal(
    plainMusic8IntroFromWpSongJson({
      title: 'Mood',
      artists: [{ name: '24kGoldn' }],
      content: '<p>24kGoldn-Moodft.ianndior</p>',
    }),
    '',
  );

  assert.equal(
    plainMusic8IntroFromWpSongJson({
      title: 'Kiss Me More',
      artists: [{ name: 'Doja Cat' }],
      content: '<p>Doja Cat -Kiss Me More ft. SZA</p>',
    }),
    '',
  );

  console.log('music8-song-fields.unit-test: ok');
}

run();
