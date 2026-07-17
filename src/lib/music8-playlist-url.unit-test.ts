/**
 * `npx tsx src/lib/music8-playlist-url.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { isMusic8PlaylistUrl, parseMusic8PlaylistUrl } from '@/lib/music8-playlist-url';

function run() {
  const parsed = parseMusic8PlaylistUrl('https://xs867261.xsrv.jp/md/playlist/dance-pop/');
  assert.ok(parsed);
  assert.equal(parsed!.slug, 'dance-pop');
  assert.equal(parsed!.canonicalUrl, 'https://xs867261.xsrv.jp/md/playlist/dance-pop/');

  assert.ok(parseMusic8PlaylistUrl('https://xs867261.xsrv.jp/md/playlist/afrobeats'));
  assert.equal(parseMusic8PlaylistUrl('https://xs867261.xsrv.jp/md/playlist/afrobeats')!.slug, 'afrobeats');

  assert.ok(parseMusic8PlaylistUrl('xs867261.xsrv.jp/md/playlist/dance-pop/'));
  assert.ok(parseMusic8PlaylistUrl('https://xs867261.xsrv.jp/md/playlist/dance-pop/?x=1#frag'));

  assert.equal(isMusic8PlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), false);
  assert.equal(isMusic8PlaylistUrl('https://xs867261.xsrv.jp/md/madonna/danceteria/'), false);
  assert.equal(isMusic8PlaylistUrl('https://example.com/md/playlist/dance-pop/'), false);
  assert.equal(isMusic8PlaylistUrl('not a url'), false);
  assert.equal(isMusic8PlaylistUrl('https://xs867261.xsrv.jp/md/playlist/'), false);

  console.log('music8-playlist-url unit tests: OK');
}

run();
