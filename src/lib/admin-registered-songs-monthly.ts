import {
  MUSIC8_NAV_STYLE_LABELS,
  MUSIC8_NAV_STYLE_SLUGS,
  music8NavStyleSlugFromName,
  type Music8NavStyleSlug,
} from '@/lib/music8-catalog-slugs';
import { buildStyleMonthly } from '@/lib/music8-catalog-json-export';

/** WP `inc/style-dashboard.php` の表示名（metal / others は小文字） */
export const ADMIN_STYLE_MONTHLY_LABELS: Record<Music8NavStyleSlug, string> = {
  ...MUSIC8_NAV_STYLE_LABELS,
  metal: 'metal',
  others: 'others',
};

/** WP `$dashboard_style_colors` と同期 */
export const ADMIN_STYLE_MONTHLY_COLORS: Record<Music8NavStyleSlug, string> = {
  pop: '#f25042',
  dance: '#f39800',
  alternative: '#448aca',
  electronica: '#ffd803',
  rb: '#8c7851',
  'hip-hop': '#078080',
  rock: '#6246ea',
  metal: '#9646ea',
  others: '#BDBDBD',
};

export type AdminRegisteredSongMonthlyRow = {
  id: string;
  style: string | null;
  created_at: string | null;
  catalog_published_at: string | null;
};

export type AdminRegisteredSongsMonthlyStyle = {
  slug: Music8NavStyleSlug;
  label: string;
  color: string;
  textOnColor: string;
  rgb: [number, number, number];
  months: number[];
  total: number;
};

export type AdminRegisteredSongsMonthlyDashboard = {
  year: number;
  total: number;
  styles: AdminRegisteredSongsMonthlyStyle[];
  monthTotals: number[];
  maxStyleCell: number;
  maxMonthTotal: number;
};

export type MonthlyCountClass = 'zero' | 'low' | 'mid' | 'high';

export function currentJstYear(now: Date = new Date()): number {
  const ymd = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const y = Number.parseInt(ymd.slice(0, 4), 10);
  return Number.isFinite(y) ? y : now.getUTCFullYear();
}

export function parseAdminRegisteredSongsMonthlyYear(
  raw: string | null | undefined,
  now: Date = new Date(),
): number {
  const n = Number.parseInt((raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return currentJstYear(now);
  return n;
}

/** 登録日（WP の投稿日相当）: catalog_published_at → created_at */
export function registrationTimestampIso(row: {
  catalog_published_at?: string | null;
  created_at?: string | null;
}): string | null {
  const published = (row.catalog_published_at ?? '').trim();
  if (published) return published;
  const created = (row.created_at ?? '').trim();
  return created || null;
}

export function jstYearMonthFromIso(iso: string | null | undefined): { year: number; month: number } | null {
  const raw = (iso ?? '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const m = raw.slice(0, 7).match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    return { year, month };
  }
  const ymd = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const m = ymd.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function isMusic8NavStyleSlug(value: string): value is Music8NavStyleSlug {
  return (MUSIC8_NAV_STYLE_SLUGS as readonly string[]).includes(value);
}

/**
 * 月次表のスタイル。catalog slug を優先し、無ければ songs.style。
 * Jazz などナビ外は others。未設定は集計しない（WP と同じ）。
 */
export function navSlugForRegisteredSongMonthly(opts: {
  catalogStyleSlug?: string | null;
  songsStyle?: string | null;
}): Music8NavStyleSlug | null {
  const catalog = (opts.catalogStyleSlug ?? '').trim().toLowerCase();
  if (isMusic8NavStyleSlug(catalog)) return catalog;
  const fromName = music8NavStyleSlugFromName(opts.songsStyle ?? '');
  if (fromName) return fromName;
  const key = (opts.songsStyle ?? '').trim().toLowerCase();
  if (key === 'jazz') return 'others';
  return null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return [189, 189, 189];
  return [Number.parseInt(h.slice(0, 2), 16), Number.parseInt(h.slice(2, 4), 16), Number.parseInt(h.slice(4, 6), 16)];
}

export function contrastTextOnHex(hex: string): '#1e293b' | '#ffffff' {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#1e293b' : '#ffffff';
}

export function monthlyCountClass(count: number, maxCount: number): MonthlyCountClass {
  if (count <= 0) return 'zero';
  if (maxCount <= 0) return 'low';
  const ratio = count / maxCount;
  if (ratio >= 0.65) return 'high';
  if (ratio >= 0.3) return 'mid';
  return 'low';
}

export function buildAdminRegisteredSongsMonthlyDashboard(opts: {
  year: number;
  songs: AdminRegisteredSongMonthlyRow[];
  catalogStyleBySongId?: Map<string, string>;
}): AdminRegisteredSongsMonthlyDashboard {
  const catalogStyleBySongId = opts.catalogStyleBySongId ?? new Map<string, string>();
  const rows: Array<{ styleSlug: string; year: number; month: number }> = [];
  for (const song of opts.songs) {
    const ym = jstYearMonthFromIso(registrationTimestampIso(song));
    if (!ym || ym.year !== opts.year) continue;
    const slug = navSlugForRegisteredSongMonthly({
      catalogStyleSlug: catalogStyleBySongId.get(song.id) ?? null,
      songsStyle: song.style,
    });
    if (!slug) continue;
    rows.push({ styleSlug: slug, year: ym.year, month: ym.month });
  }
  const built = buildStyleMonthly(rows, opts.year);
  const styles: AdminRegisteredSongsMonthlyStyle[] = MUSIC8_NAV_STYLE_SLUGS.map((slug) => {
    const cell = built.styles.find((s) => s.style === slug);
    const months = cell?.months ?? Array.from({ length: 12 }, () => 0);
    const color = ADMIN_STYLE_MONTHLY_COLORS[slug];
    return {
      slug,
      label: ADMIN_STYLE_MONTHLY_LABELS[slug],
      color,
      textOnColor: contrastTextOnHex(color),
      rgb: hexToRgb(color),
      months,
      total: cell?.total ?? 0,
    };
  });
  const monthTotals = Array.from({ length: 12 }, (_, i) => styles.reduce((sum, s) => sum + s.months[i], 0));
  return {
    year: opts.year,
    total: built.total,
    styles,
    monthTotals,
    maxStyleCell: Math.max(0, ...styles.flatMap((s) => s.months)),
    maxMonthTotal: Math.max(0, ...monthTotals),
  };
}
