import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalYouTubeWatchUrl,
  resolveYouTubeWatchUrlFromSharePayload,
} from './youtube-canonical-watch-url';

test('canonicalYouTubeWatchUrl: watch param', () => {
  assert.equal(
    canonicalYouTubeWatchUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
});

test('canonicalYouTubeWatchUrl: youtu.be', () => {
  assert.equal(
    canonicalYouTubeWatchUrl('https://youtu.be/dQw4w9WgXcQ'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
});

test('canonicalYouTubeWatchUrl: shorts', () => {
  assert.equal(
    canonicalYouTubeWatchUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
});

test('resolveYouTubeWatchUrlFromSharePayload: text with URL', () => {
  assert.equal(
    resolveYouTubeWatchUrlFromSharePayload({
      text: 'Check this https://youtu.be/dQw4w9WgXcQ out',
    }),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
});

test('resolveYouTubeWatchUrlFromSharePayload: non-youtube returns null', () => {
  assert.equal(
    resolveYouTubeWatchUrlFromSharePayload({ url: 'https://example.com/' }),
    null,
  );
});
