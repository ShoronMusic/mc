/**
 * npx tsx src/lib/spotify-track-match.unit-test.ts
 */
import assert from 'node:assert/strict';
import {
  isSpotifyRejectListed,
  pickBestSpotifyCandidate,
  scoreSpotifyTrackCandidate,
  type SpotifyTrackCandidate,
} from '@/lib/spotify-track-match';

assert.equal(isSpotifyRejectListed(['The Hit Co.'], 'Girls of Summer'), 'reject_artist_pattern');
assert.equal(
  isSpotifyRejectListed(['Backing Business'], 'Interstellar - Karaoke Version'),
  'reject_artist_pattern',
);
assert.equal(
  isSpotifyRejectListed(['Some Artist'], 'Interstellar - Karaoke Version Originally Performed by X'),
  'reject_title_pattern',
);

const aerosmithOk: SpotifyTrackCandidate = {
  spotifyTrackId: 'real',
  spotifyName: 'Girls of Summer',
  spotifyArtists: 'Aerosmith',
  artistRefs: [{ id: '1', name: 'Aerosmith' }],
  popularity: 45,
};

const d = scoreSpotifyTrackCandidate(aerosmithOk, 'Aerosmith', 'Girls Of Summer');
assert.equal(d.action, 'apply');

const tribute: SpotifyTrackCandidate = {
  spotifyTrackId: 'bad',
  spotifyName: 'Girls of Summer',
  spotifyArtists: 'The Hit Co., The Tribute Co.',
  artistRefs: [
    { id: 'h', name: 'The Hit Co.' },
    { id: 't', name: 'The Tribute Co.' },
  ],
  popularity: 10,
};

const d2 = scoreSpotifyTrackCandidate(tribute, 'Aerosmith', 'Girls Of Summer');
assert.equal(d2.action, 'review');

const picked = pickBestSpotifyCandidate(
  [tribute, aerosmithOk],
  'Aerosmith',
  'Girls Of Summer',
);
assert.equal(picked.decision.action, 'apply');
assert.equal(picked.best?.spotifyTrackId, 'real');

// 邦楽: main_artist 日本語 vs Spotify 英語名 → name_en ヒントで apply
const yonezu: SpotifyTrackCandidate = {
  spotifyTrackId: 'y1',
  spotifyName: '月を見ていた - Moongazing',
  spotifyArtists: 'Kenshi Yonezu',
  artistRefs: [{ id: '1snhtMLeb2DYoMOcVbb8iB', name: 'Kenshi Yonezu' }],
  popularity: 55,
};
const dMismatch = scoreSpotifyTrackCandidate(yonezu, '米津玄師', '月を見ていた');
assert.equal(dMismatch.action, 'review');
if (dMismatch.action === 'review') assert.equal(dMismatch.reason, 'artist_mismatch');

const dAlias = scoreSpotifyTrackCandidate(yonezu, '米津玄師', '月を見ていた', {
  alternateArtistNames: ['Kenshi Yonezu'],
});
assert.equal(dAlias.action, 'apply');

const dById = scoreSpotifyTrackCandidate(yonezu, '米津玄師', '月を見ていた', {
  expectedSpotifyArtistIds: ['1snhtMLeb2DYoMOcVbb8iB'],
});
assert.equal(dById.action, 'apply');

// 英訳付き / ANIME edit → spotify_artist_id 一致なら apply
const sayonara: SpotifyTrackCandidate = {
  spotifyTrackId: 'y2',
  spotifyName: 'さよーならまたいつか！ - Sayonara',
  spotifyArtists: 'Kenshi Yonezu',
  artistRefs: [{ id: '1snhtMLeb2DYoMOcVbb8iB', name: 'Kenshi Yonezu' }],
  popularity: 40,
};
assert.equal(
  scoreSpotifyTrackCandidate(sayonara, '米津玄師', 'さよーならまたいつか！', {
    expectedSpotifyArtistIds: ['1snhtMLeb2DYoMOcVbb8iB'],
  }).action,
  'apply',
);

const kickBack: SpotifyTrackCandidate = {
  spotifyTrackId: 'y3',
  spotifyName: 'KICK BACK -ANIME edit',
  spotifyArtists: 'Kenshi Yonezu',
  artistRefs: [{ id: '1snhtMLeb2DYoMOcVbb8iB', name: 'Kenshi Yonezu' }],
  popularity: 50,
};
assert.equal(
  scoreSpotifyTrackCandidate(kickBack, '米津玄師', 'Kickback', {
    expectedSpotifyArtistIds: ['1snhtMLeb2DYoMOcVbb8iB'],
  }).action,
  'apply',
);

// slug エイリアス（sakanaction）で日本語 main_artist ↔ Spotify 英語名
const kaiju: SpotifyTrackCandidate = {
  spotifyTrackId: '6Fh',
  spotifyName: '怪獣',
  spotifyArtists: 'Sakanaction',
  artistRefs: [{ id: 'sak', name: 'Sakanaction' }],
  popularity: 70,
};
assert.equal(
  scoreSpotifyTrackCandidate(kaiju, 'サカナクション', '怪獣', {
    alternateArtistNames: ['sakanaction'],
    crossScriptArtistNames: ['sakanaction'],
  }).action,
  'apply',
);

// Spotify 英題 Kaiju ↔ DB 日本語 怪獣（slug でアーティスト確定時）
const kaijuEn: SpotifyTrackCandidate = {
  spotifyTrackId: '7sMRDjjwsB7wQEBOkdfg0i',
  spotifyName: 'Kaiju',
  spotifyArtists: 'sakanaction',
  artistRefs: [{ id: 'sak', name: 'sakanaction' }],
  popularity: 70,
};
assert.equal(
  scoreSpotifyTrackCandidate(kaijuEn, 'サカナクション', '怪獣', {
    alternateArtistNames: ['sakanaction'],
    crossScriptArtistNames: ['sakanaction'],
  }).action,
  'apply',
);
// name_en 汚染だけ（slug なし）では英題を自動採用しない
assert.equal(
  scoreSpotifyTrackCandidate(kaijuEn, 'サカナクション', '怪獣', {
    alternateArtistNames: ['sakanaction'],
  }).action,
  'review',
);
assert.equal(
  scoreSpotifyTrackCandidate(kaijuEn, 'サカナクション', '怪獣').action,
  'review',
);

console.log('spotify-track-match.unit-test: ok');
