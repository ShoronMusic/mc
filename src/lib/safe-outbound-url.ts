/**
 * Admin 等のサーバ側 URL 取得向け SSRF 緩和。
 * - https のみ（http は明示許可時のみ）
 * - プライベート IP / リンクローカル / localhost 拒否
 * - 任意でホスト allowlist
 */

export type SafeFetchUrlResult =
  | { ok: true; url: URL }
  | { ok: false; error: string };

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1|\[::1\])/i;

function isPrivateIpv4(hostname: string): boolean {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function assertSafeOutboundUrl(
  raw: string,
  options?: {
    allowHttp?: boolean;
    allowedHosts?: string[];
  },
): SafeFetchUrlResult {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'URL の形式が不正です。' };
  }

  const proto = url.protocol.toLowerCase();
  if (proto === 'https:') {
    // ok
  } else if (proto === 'http:' && options?.allowHttp) {
    // ok
  } else {
    return { ok: false, error: 'URL は https のみ対応です。' };
  }

  const host = url.hostname.trim().toLowerCase();
  if (!host) return { ok: false, error: 'ホストが空です。' };
  if (PRIVATE_HOST_RE.test(host) || isPrivateIpv4(host)) {
    return { ok: false, error: '内部向けホストへの取得はできません。' };
  }
  if (host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, error: '内部向けホストへの取得はできません。' };
  }

  const allow = (options?.allowedHosts ?? [])
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length > 0 && !allow.includes(host)) {
    return { ok: false, error: '許可されていないホストです。' };
  }

  return { ok: true, url };
}

/** 環境変数 `SAFE_FETCH_ALLOWED_HOSTS`（カンマ区切り）があればそのホストのみ */
export function getSafeFetchAllowedHostsFromEnv(): string[] {
  const raw = process.env.SAFE_FETCH_ALLOWED_HOSTS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
