'use client';

function formatJstHm(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** API の `activeUsageTimeLabel` が無い場合に `activeFromAt` / `activeToAt` から組み立てる */
export function buildActiveUsageTimeLabelFromFetch(data: Record<string, unknown>): string {
  const u = data.activeUsageTimeLabel;
  if (typeof u === 'string' && u.trim()) return u;
  const a = data.activeFromAt;
  const b = data.activeToAt;
  if (typeof a === 'string' && typeof b === 'string') return `${formatJstHm(a)}〜${formatJstHm(b)}`;
  return '—';
}

export type RoomSessionChatSummaryDisplay = {
  sessionWindowLabel: string;
  activeUsageTimeLabel: string;
  participantSongCounts?: { displayName: string; count: number }[];
  eraDistribution?: { era: string; count: number }[];
  styleDistribution?: { style: string; count: number }[];
  popularArtists?: { artist: string; count: number }[];
};

function distLine<T extends { count: number }>(
  items: T[] | undefined,
  fmt: (v: T) => string,
): string {
  return (items ?? []).map(fmt).join(' / ') || '—';
}

/** チャットサマリーモーダル本文（定型レイアウト） */
export default function ChatSummaryModalBody({ summary }: { summary: RoomSessionChatSummaryDisplay }) {
  const participantSong =
    distLine(summary.participantSongCounts, (v) => `${v.displayName}(${v.count})`);
  const era = distLine(summary.eraDistribution, (v) => `${v.era}(${v.count})`);
  const style = distLine(summary.styleDistribution, (v) => `${v.style}(${v.count})`);
  const artists = distLine(summary.popularArtists, (v) => `${v.artist}(${v.count})`);

  const text = `対象枠： ${summary.sessionWindowLabel || '—'}
実利用時間： ${summary.activeUsageTimeLabel || '—'}
参加者(選曲数)：${participantSong}

選曲傾向
・時代：${era}
・スタイル：${style}
・アーティスト：${artists}`;

  return <div className="whitespace-pre-line text-sm leading-relaxed text-gray-200">{text}</div>;
}
