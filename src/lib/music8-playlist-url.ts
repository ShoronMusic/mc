/**
 * Music8 公開プレイリスト URL の判定・slug 抽出。
 * 例: https://xs867261.xsrv.jp/md/playlist/dance-pop/
 *
 * クライアント（ChatInput / Room）からも import するため、
 * music8-wp-rest 等のサーバー寄りのモジュールには依存しない。
 */

import { normalizeToAbsoluteUrlIfStandalone } from '@/lib/youtube';

const DEFAULT_SITE_ORIGIN = 'https://xs867261.xsrv.jp';
const DEFAULT_SITE_PATH_PREFIX = '/md';

/** `/playlist/{slug}` または `/md/playlist/{slug}` */
const PLAYLIST_PATH_RE = /^(?:\/md)?\/playlist\/([^/]+)\/?$/i;

export type ParsedMusic8PlaylistUrl = {
  slug: string;
  canonicalUrl: string;
  host: string;
};

function originFromEnvRestBase(): { origin: string; pathPrefix: string } | null {
  // サーバーでは MUSIC8_WP_REST_BASE_URL。クライアントでは未定義のため既定ホストを使う。
  const raw = (process.env.MUSIC8_WP_REST_BASE_URL ?? '').trim();
  if (!raw || raw === '0' || /^off$/i.test(raw) || /^false$/i.test(raw)) return null;
  try {
    const u = new URL(raw.replace(/\/+$/, ''));
    const path = u.pathname.replace(/\/+$/, '');
    const wpJsonIdx = path.lastIndexOf('/wp-json');
    const sitePath = wpJsonIdx >= 0 ? path.slice(0, wpJsonIdx) : '';
    return { origin: u.origin, pathPrefix: sitePath || '' };
  } catch {
    return null;
  }
}

/** 許可ホスト（小文字）。既定 WP ホスト + env 追加。 */
export function getMusic8PlaylistAllowedHosts(): Set<string> {
  const hosts = new Set<string>();
  const fromWp = originFromEnvRestBase();
  if (fromWp) {
    hosts.add(fromWp.origin.replace(/^https?:\/\//i, '').toLowerCase());
  } else {
    try {
      hosts.add(new URL(DEFAULT_SITE_ORIGIN).host.toLowerCase());
    } catch {
      hosts.add('xs867261.xsrv.jp');
    }
  }
  const extraServer = (process.env.MUSIC8_PLAYLIST_ALLOWED_HOSTS ?? '').trim();
  const extraPublic = (process.env.NEXT_PUBLIC_MUSIC8_PLAYLIST_ALLOWED_HOSTS ?? '').trim();
  for (const extra of [extraServer, extraPublic]) {
    if (!extra) continue;
    for (const part of extra.split(',')) {
      const h = part.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
      if (h) hosts.add(h);
    }
  }
  return hosts;
}

function sitePathPrefix(): string {
  const fromWp = originFromEnvRestBase();
  if (fromWp) return fromWp.pathPrefix || DEFAULT_SITE_PATH_PREFIX;
  return DEFAULT_SITE_PATH_PREFIX;
}

function isPlaylistSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9_-]*$/i.test(slug) && !slug.includes('..');
}

/**
 * Music8 プレイリスト公開 URL なら slug と canonical を返す。
 * 曲ページや YouTube URL は null。
 */
export function parseMusic8PlaylistUrl(text: string): ParsedMusic8PlaylistUrl | null {
  const abs = normalizeToAbsoluteUrlIfStandalone(text);
  if (!abs) return null;
  let u: URL;
  try {
    u = new URL(abs);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.host.toLowerCase();
  if (!getMusic8PlaylistAllowedHosts().has(host)) return null;

  const path = u.pathname.replace(/\/+$/, '') || '/';
  const pathForMatch = path.endsWith('/') ? path.slice(0, -1) : path;
  const m = pathForMatch.match(/^(?:\/md)?\/playlist\/([^/]+)$/i) ?? path.match(PLAYLIST_PATH_RE);
  if (!m?.[1]) return null;
  const slug = decodeURIComponent(m[1]).trim();
  if (!isPlaylistSlug(slug)) return null;

  const prefix = sitePathPrefix() || DEFAULT_SITE_PATH_PREFIX;
  const canonicalPath = `${prefix}/playlist/${slug}/`.replace(/\/{2,}/g, '/');
  const canonicalUrl = `${u.protocol}//${u.host}${canonicalPath}`;

  return { slug, canonicalUrl, host };
}

export function isMusic8PlaylistUrl(text: string): boolean {
  return parseMusic8PlaylistUrl(text) != null;
}
