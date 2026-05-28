import assert from 'node:assert/strict';
import {
  fingerprintMusic8ArtistJson,
  fingerprintMusic8WpSongJson,
  sha256Hex,
  stableStringify,
} from '@/lib/music8-sync-fingerprint';

const sampleSong = {
  id: 100,
  slug: 'every-breath-you-take',
  title: 'Every Breath You Take',
  videoId: 'OMOGaugKpzs',
  date: '1983-05-25',
  genres: [{ name: 'New wave' }],
  styles: [2849],
  content: '<p>Test description</p>',
  artists: [{ name: 'Police', slug: 'police' }],
  acf: { spotify_track_id: 'abc123' },
};

assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));

const fp1 = fingerprintMusic8WpSongJson(sampleSong);
const fp2 = fingerprintMusic8WpSongJson({ ...sampleSong });
assert.ok(fp1 && fp1.length === 64);
assert.equal(fp1, fp2);

const fp3 = fingerprintMusic8WpSongJson({ ...sampleSong, title: 'Different Title' });
assert.notEqual(fp1, fp3);

const artist = {
  id: 4834,
  slug: 'strokes',
  name: 'Strokes',
  thePrefix: 'The',
  description: 'English bio',
  artistjpname: 'ザ・ストロークス',
};
const afp1 = fingerprintMusic8ArtistJson(artist);
const afp2 = fingerprintMusic8ArtistJson({ ...artist, description: 'Updated bio' });
assert.ok(afp1);
assert.notEqual(afp1, afp2);

assert.equal(sha256Hex('x').length, 64);

console.log('music8-sync-fingerprint.unit-test.ts: ok');
