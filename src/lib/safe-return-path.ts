/**
 * クエリ `returnTo` 用。オープンリダイレクトを防ぎ、ルーム直下パスのみ許可する。
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
