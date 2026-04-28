import assert from 'node:assert/strict';
import {
  extractMusic8SongFields,
  extractMusic8SongFieldsFromPersistedSnapshot,
  parseMusicaichatStructuredMetadataFromFactsText,
  resolveSongStyleForOverwriteFromMusic8,
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

  console.log('music8-song-fields.unit-test: ok');
}

run();
