import {
  playbackHistorySongTitleOnly,
  snapshotPlaybackHistoryDisplayTitle,
} from './playback-history-display-title';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(
  snapshotPlaybackHistoryDisplayTitle('サカナクション - 夜の踊り子', 'サカナクション') ===
    'サカナクション - 夜の踊り子',
  'no duplicate join when title already combined',
);

assert(
  snapshotPlaybackHistoryDisplayTitle('夜の踊り子', 'サカナクション') === 'サカナクション - 夜の踊り子',
  'join when title is song only',
);

assert(
  playbackHistorySongTitleOnly('サカナクション - 夜の踊り子', 'サカナクション') === '夜の踊り子',
  'extract song title only',
);

console.log('playback-history-display-title.unit-test.ts: ok');
