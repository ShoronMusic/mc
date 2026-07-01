import {
  addYoutubeApiLogToStats,
  emptyYoutubeApiSlotStats,
} from './youtube-api-slot-aggregate';

const stats = emptyYoutubeApiSlotStats();
addYoutubeApiLogToStats(stats, { endpoint: 'search.list', ok: true });
addYoutubeApiLogToStats(stats, { endpoint: 'videos.list', ok: false });

const ok = stats.calls === 2 && stats.okCalls === 1 && stats.searchCalls === 1 && stats.videosCalls === 1;

if (!ok) {
  console.error('youtube-api-slot-aggregate unit tests: FAILED', stats);
  process.exit(1);
}
console.log('youtube-api-slot-aggregate unit tests: OK');
