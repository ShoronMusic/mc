/**
 * 同意後の遷移先。オープンリダイレクトを防ぎ、同一オリジン内のパスのみ許可。
 */
export function safeInternalPath(raw: string | string[] | undefined): string {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s || typeof s !== 'string') return '/';

  const trimmed = s.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';

  let pathname = trimmed;
  let search = '';
  const q = trimmed.indexOf('?');
  if (q >= 0) {
    pathname = trimmed.slice(0, q);
    search = trimmed.slice(q);
  }

  // ループ防止・外部URL風を拒否
  if (pathname.startsWith('/consent')) return '/';

  if (pathname === '/') return '/' + search;

  // 単一セグメントのみ（/01, /guide, /admin など）。パストラバーサル防止。
  if (!/^\/[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(pathname)) {
    return '/';
  }

  return pathname + search;
}
