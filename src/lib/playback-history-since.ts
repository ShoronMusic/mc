import { resolveGuestSoloPlaybackHistorySinceIso } from '@/lib/guest-solo-playback-history-since';

export function parseIsoTimestamp(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string' || !iso.trim()) return null;
  const ms = new Date(iso.trim()).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * 視聴履歴 GET の `since` に渡す ISO8601。
 * - ゲスト単独: 入室時刻以降
 * - 開催中の会: gathering.started_at 以降（別主催者の過去分を除外）
 * 両方該当するときは遅い方（より新しい下限）を採用。
 */
export function resolvePlaybackHistorySinceIso(params: {
  isGuest: boolean;
  roomHasRegisteredParticipant: boolean;
  sessionEnteredAtMs: number;
  gatheringStartedAtIso?: string | null;
}): string | undefined {
  const cutoffsMs: number[] = [];

  const guestSince = resolveGuestSoloPlaybackHistorySinceIso(
    params.isGuest,
    params.roomHasRegisteredParticipant,
    params.sessionEnteredAtMs,
  );
  const guestMs = parseIsoTimestamp(guestSince);
  if (guestMs != null) cutoffsMs.push(guestMs);

  const gatheringMs = parseIsoTimestamp(params.gatheringStartedAtIso);
  if (gatheringMs != null) cutoffsMs.push(gatheringMs);

  if (cutoffsMs.length === 0) return undefined;
  return new Date(Math.max(...cutoffsMs)).toISOString();
}

/** API 側: 複数の since 候補のうち最も新しい（厳しい）下限 */
export function maxIsoTimestamp(...candidates: (string | null | undefined)[]): string | undefined {
  const cutoffsMs = candidates
    .map((c) => parseIsoTimestamp(c))
    .filter((ms): ms is number => ms != null);
  if (cutoffsMs.length === 0) return undefined;
  return new Date(Math.max(...cutoffsMs)).toISOString();
}
