/**
 * `npx tsx src/lib/music8-playlist-fetch.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { normalizeMusic8PlaylistSongs } from '@/lib/music8-playlist-fetch';

function run() {
  const raw = [
    { id: 1, title: 'Old', yt_video_id: 'aaaaaaaaaaa', first_artist: 'A', post_date: '2020-01-01' },
    { id: 2, title: 'New', yt_video_id: 'bbbbbbbbbbb', first_artist: 'B', post_date: '2026-07-10' },
    { id: 3, title: 'NoId', yt_video_id: '', first_artist: 'C', post_date: '2026-01-01' },
    { id: 4, title: 'Dup', yt_video_id: 'bbbbbbbbbbb', first_artist: 'B2', post_date: '2025-01-01' },
    { id: 5, title: 'NoDate', yt_video_id: 'ccccccccccc', first_artist: 'D' },
  ];

  const { songs, totalFetched, truncated } = normalizeMusic8PlaylistSongs(raw, 40);
  assert.equal(totalFetched, 3);
  assert.equal(truncated, false);
  assert.equal(songs[0]!.videoId, 'bbbbbbbbbbb');
  assert.equal(songs[0]!.title, 'New');
  assert.equal(songs[1]!.videoId, 'aaaaaaaaaaa');
  assert.equal(songs[2]!.videoId, 'ccccccccccc'); // 日付欠損は末尾

  const many = normalizeMusic8PlaylistSongs(
    Array.from({ length: 5 }, (_, i) => ({
      id: i,
      title: `T${i}`,
      yt_video_id: `abcdefghij${i}`,
      first_artist: 'X',
      post_date: `2026-0${i + 1}-01`,
    })),
    2,
  );
  assert.equal(many.songs.length, 2);
  assert.equal(many.truncated, true);
  assert.equal(many.totalFetched, 5);
  assert.equal(many.songs[0]!.videoId, 'abcdefghij4'); // newest month

  const unlimited = normalizeMusic8PlaylistSongs(
    Array.from({ length: 5 }, (_, i) => ({
      id: i,
      title: `T${i}`,
      yt_video_id: `abcdefghij${i}`,
      first_artist: 'X',
      post_date: `2026-0${i + 1}-01`,
    })),
    null,
  );
  assert.equal(unlimited.songs.length, 5);
  assert.equal(unlimited.truncated, false);
  assert.equal(unlimited.totalFetched, 5);

  console.log('music8-playlist-fetch unit tests: OK');
}

run();
