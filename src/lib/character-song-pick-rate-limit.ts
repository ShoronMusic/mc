/**
 * character-song-pick 用: 部屋単位の最小間隔（複数タブ・再マウントで同一部屋に LLM が連打されるのを防ぐ）。
 */

const g = globalThis as unknown as {
  __characterSongPickLastAtByRoom?: Map<string, number>;
};

function getMap(): Map<string, number> {
  if (!g.__characterSongPickLastAtByRoom) g.__characterSongPickLastAtByRoom = new Map();
  return g.__characterSongPickLastAtByRoom;
}

function getMinGapMs(): number {
  const raw = process.env.CHARACTER_SONG_PICK_MIN_GAP_MS;
  if (raw == null || String(raw).trim() === '') return 90_000;
  const n = parseInt(String(raw), 10);
  if (Number.isFinite(n) && n >= 15_000 && n <= 600_000) return n;
  return 90_000;
}

export type CharacterSongPickRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

/**
 * @param roomId 空のときは制限しない（ローカル検証用など）
 */
export function checkCharacterSongPickRateLimit(roomId: string): CharacterSongPickRateLimitResult {
  const trimmed = roomId.trim();
  if (!trimmed) return { ok: true };

  const minGap = getMinGapMs();
  const now = Date.now();
  const map = getMap();
  const key = `room:${trimmed}`;
  const last = map.get(key) ?? 0;
  const elapsed = now - last;
  if (elapsed < minGap) {
    const retryAfterMs = minGap - elapsed;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  map.set(key, now);
  if (map.size > 4000) {
    const cutoff = now - minGap;
    map.forEach((t, k) => {
      if (t < cutoff) map.delete(k);
    });
  }
  return { ok: true };
}
