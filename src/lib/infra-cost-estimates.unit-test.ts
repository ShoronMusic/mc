import {
  computeYoutubeApiQuotaUnits,
  enrichYoutubeApiStats,
  estimateAblyCost,
  YOUTUBE_API_QUOTA_SEARCH,
} from './infra-cost-estimates';
import { emptyYoutubeApiSlotStats } from './youtube-api-slot-aggregate';

const ytStats = enrichYoutubeApiStats({
  calls: 3,
  okCalls: 2,
  searchCalls: 1,
  videosCalls: 2,
});

const ytOk =
  ytStats.quotaUnits === YOUTUBE_API_QUOTA_SEARCH + 2 &&
  Math.abs(ytStats.costJpyApprox - ytStats.quotaUnits * 0.0015) < 1e-9;

const emptyQuota = computeYoutubeApiQuotaUnits(emptyYoutubeApiSlotStats());
const ably = estimateAblyCost(14, 765);

const ablyOk =
  ably.messagesEstimated === 779 && Math.abs(ably.costJpyApprox - 779 * 0.0004) < 1e-9;

if (!ytOk || emptyQuota !== 0 || !ablyOk) {
  console.error('infra-cost-estimates unit tests: FAILED', { ytStats, emptyQuota, ably });
  process.exit(1);
}
console.log('infra-cost-estimates unit tests: OK');
