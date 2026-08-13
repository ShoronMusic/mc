/**
 * `npx tsx src/lib/music8-playlist-autoplay.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  advanceMusic8PlaylistAutoplay,
  createMusic8PlaylistAutoplayState,
  formatMusic8PlaylistJumpMessage,
  formatMusic8PlaylistManualNextMessage,
  formatMusic8PlaylistSkipUnplayableMessage,
  formatMusic8PlaylistStartMessage,
  formatMusic8PlaylistTrackMessage,
  getMusic8PlaylistCurrentSong,
  isLibraryArtistPlaylistAutoplay,
  isMusic8PlaylistAutoplayCurrentVideo,
  isYoutubePlayerErrorWorthPlaylistSkip,
  jumpMusic8PlaylistAutoplay,
  playlistAutoplaySongPickButtonLabel,
  playlistAutoplaySongPickModalHeading,
} from '@/lib/music8-playlist-autoplay';

function run() {
  const state = createMusic8PlaylistAutoplayState({
    slug: 'dance-pop',
    title: 'Dance-pop',
    songs: [
      { videoId: 'aaaaaaaaaaa', title: 'A', artist: 'X' },
      { videoId: 'bbbbbbbbbbb', title: 'B', artist: 'Y' },
      { videoId: 'ccccccccccc', title: 'C', artist: 'Z' },
    ],
  });
  assert.ok(state);
  assert.equal(state!.index, 0);
  assert.equal(getMusic8PlaylistCurrentSong(state!)!.videoId, 'aaaaaaaaaaa');
  assert.equal(isMusic8PlaylistAutoplayCurrentVideo(state!, 'aaaaaaaaaaa'), true);
  assert.equal(isLibraryArtistPlaylistAutoplay(state), false);
  assert.equal(playlistAutoplaySongPickButtonLabel(state), '再生リスト');
  assert.equal(playlistAutoplaySongPickModalHeading(state), '再生リスト曲リスト');

  const next = advanceMusic8PlaylistAutoplay(state!);
  assert.ok(next);
  assert.equal(next!.index, 1);
  const jumped = jumpMusic8PlaylistAutoplay(next!, 0);
  assert.ok(jumped);
  assert.equal(jumped!.index, 0);
  assert.equal(getMusic8PlaylistCurrentSong(jumped!)!.videoId, 'aaaaaaaaaaa');
  assert.equal(jumpMusic8PlaylistAutoplay(next!, 99), null);
  assert.match(formatMusic8PlaylistJumpMessage(jumped), /指定して再生/);
  assert.equal(advanceMusic8PlaylistAutoplay(advanceMusic8PlaylistAutoplay(next!)!), null);

  const libState = createMusic8PlaylistAutoplayState({
    slug: 'library-strokes',
    title: 'Strokes',
    sourceLabel: 'ライブラリ',
    songs: [{ videoId: 'ddddddddddd', title: 'Hard To Explain', artist: 'Strokes' }],
  });
  assert.equal(isLibraryArtistPlaylistAutoplay(libState), true);
  assert.equal(playlistAutoplaySongPickButtonLabel(libState), 'ライブラリ');
  assert.equal(playlistAutoplaySongPickModalHeading(libState), 'ライブラリ曲リスト');

  const msg = formatMusic8PlaylistStartMessage({
    title: 'Dance-pop',
    songCount: 40,
    truncated: true,
    totalFetched: 55,
  });
  assert.ok(msg.includes('40曲'));
  assert.ok(msg.includes('55'));

  assert.equal(
    formatMusic8PlaylistTrackMessage(state!),
    'Music8「Dance-pop」1/3曲目: X - A',
  );
  assert.equal(
    formatMusic8PlaylistTrackMessage(next!),
    'Music8「Dance-pop」2/3曲目: Y - B',
  );

  const ytState = createMusic8PlaylistAutoplayState({
    slug: 'PLabc',
    title: 'My playlist',
    sourceLabel: 'YouTube',
    orderLabel: 'プレイリスト順',
    songs: [{ videoId: 'ccccccccccc', title: 'Song', artist: 'Artist' }],
  });
  assert.ok(ytState);
  assert.equal(
    formatMusic8PlaylistStartMessage({
      title: ytState!.title,
      songCount: ytState!.songs.length,
      sourceLabel: ytState!.sourceLabel,
      orderLabel: ytState!.orderLabel,
    }),
    'YouTube「My playlist」1曲を連続再生します（プレイリスト順）',
  );
  assert.equal(formatMusic8PlaylistTrackMessage(ytState!), 'YouTube「My playlist」1/1曲目: Artist - Song');

  const skipMsg = formatMusic8PlaylistSkipUnplayableMessage(state, state!.songs[0]!);
  assert.match(skipMsg, /スキップ/);
  assert.match(skipMsg, /X - A/);
  assert.equal(
    formatMusic8PlaylistManualNextMessage(state),
    'Music8: この曲をスキップして次の曲へ進みます。',
  );
  assert.equal(isYoutubePlayerErrorWorthPlaylistSkip(100), true);
  assert.equal(isYoutubePlayerErrorWorthPlaylistSkip(150), true);

  console.log('music8-playlist-autoplay unit tests: OK');
}

run();
