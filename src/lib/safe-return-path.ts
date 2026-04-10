/**
 * クエリ `returnTo` 用。オープンリダイレクトを防ぎ、部屋直下パスのみ許可する。
 * roomId は API 側と同様に [a-zA-Z0-9_-]{1,48} を想定。
 */
const BLOCKED_FIRST_SEGMENTS = new Set([
  'guide',
  'admin',
  'auth',
  'api',
  'terms',
  'privacy',
  'consent',
  '_next',
  'favicon.ico',
]);

export function getSafeInternalReturnPath(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.trim());
  } catch {
    return null;
  }
  if (decoded.includes('..') || decoded.includes('\\')) return null;
  let pathOnly = decoded.split(/[?#]/, 1)[0] ?? '';
  if (!pathOnly.startsWith('/')) {
    pathOnly = `/${pathOnly}`;
  }
  if (pathOnly.startsWith('//')) return null;
  const segments = pathOnly.split('/').filter(Boolean);
  if (segments.length !== 1) return null;
  const seg = segments[0]!;
  if (BLOCKED_FIRST_SEGMENTS.has(seg.toLowerCase())) return null;
  if (seg.length > 48) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(seg)) return null;
  return `/${seg}`;
}

/** ガイド閲覧後に「チャットへ戻る」用。参加中の部屋 ID のみ保存（オープンリダイレクト防止の検証は getSafeInternalReturnPath と同じ）。 */
const GUIDE_RETURN_ROOM_STORAGE_KEY = 'musicai_last_guide_return_room';

export function rememberRoomForGuideReturn(roomSegment: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const trimmed = typeof roomSegment === 'string' ? roomSegment.trim() : '';
  if (!trimmed) return;
  const path = getSafeInternalReturnPath(trimmed) ?? getSafeInternalReturnPath(`/${trimmed}`);
  if (!path) return;
  try {
    sessionStorage.setItem(GUIDE_RETURN_ROOM_STORAGE_KEY, path.slice(1));
  } catch {
    /* private mode 等 */
  }
}

/** クエリに returnTo が無いとき、直近に記録した部屋パス（例 `/05`）を返す。 */
export function readRememberedGuideReturnPath(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(GUIDE_RETURN_ROOM_STORAGE_KEY);
    return getSafeInternalReturnPath(raw ?? undefined);
  } catch {
    return null;
  }
}
