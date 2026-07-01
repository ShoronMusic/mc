/** 12h スロット内の YouTube Data API 呼び出し集計 */

export type YoutubeApiSlotStats = {
  calls: number;
  okCalls: number;
  searchCalls: number;
  videosCalls: number;
};

export function emptyYoutubeApiSlotStats(): YoutubeApiSlotStats {
  return { calls: 0, okCalls: 0, searchCalls: 0, videosCalls: 0 };
}

export function addYoutubeApiLogToStats(
  stats: YoutubeApiSlotStats,
  row: { endpoint?: string | null; ok?: boolean | null },
): void {
  stats.calls += 1;
  if (row.ok === true) stats.okCalls += 1;
  const ep = (row.endpoint ?? '').toLowerCase();
  if (ep.includes('search')) stats.searchCalls += 1;
  else if (ep.includes('videos')) stats.videosCalls += 1;
}
