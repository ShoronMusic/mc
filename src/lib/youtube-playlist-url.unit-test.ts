/**
 * `npx tsx src/lib/youtube-playlist-url.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { isYoutubePlaylistUrl, parseYoutubePlaylistUrl } from '@/lib/youtube-playlist-url';

function run() {
  assert.equal(
    parseYoutubePlaylistUrl('https://www.youtube.com/playlist?list=PL1234567890abcdef')?.playlistId,
    'PL1234567890abcdef',
  );
  assert.equal(
    parseYoutubePlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abcdef')?.canonicalUrl,
    'https://www.youtube.com/playlist?list=PL1234567890abcdef',
  );
  assert.equal(
    parseYoutubePlaylistUrl('https://music.youtube.com/playlist?list=RDCLAK5uy_test123')?.playlistId,
    'RDCLAK5uy_test123',
  );
  assert.equal(isYoutubePlaylistUrl('https://youtu.be/dQw4w9WgXcQ'), false);
  assert.equal(isYoutubePlaylistUrl('https://example.com/playlist?list=PL1234567890abcdef'), false);
  assert.equal(isYoutubePlaylistUrl('not a url'), false);

  // トップからサムネイルをクリックした単曲視聴 URL。自動生成ミックス（list=RD<videoId>・start_radio=1）が
  // 付いているだけなので、プレイリストではなく単曲として扱う（意図せぬ連続再生の防止）。
  assert.equal(
    isYoutubePlaylistUrl(
      'https://www.youtube.com/watch?v=yx7P7cv2Sn8&list=RDyx7P7cv2Sn8&start_radio=1',
    ),
    false,
  );
  // start_radio が無くても、watch URL に付いた RD ミックスは単曲扱い。
  assert.equal(
    isYoutubePlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ'),
    false,
  );
  // マイミックス（RDMM…）も同様に単曲扱い。
  assert.equal(
    isYoutubePlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDMMabcdef123'),
    false,
  );
  // 明示的な /playlist ページのミックスは従来どおりプレイリストとして扱う。
  assert.equal(
    isYoutubePlaylistUrl('https://www.youtube.com/playlist?list=RDdQw4w9WgXcQ'),
    true,
  );
  // 実プレイリスト（PL…）を視聴中の watch URL は従来どおりプレイリスト扱い。
  assert.equal(
    isYoutubePlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdef123456&index=3'),
    true,
  );

  console.log('youtube-playlist-url unit tests: OK');
}

run();
