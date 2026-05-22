/**
 * Music8 アーティストの正規表示名（thePrefix + name）と、
 * DB 上の The あり／なしゆれの判定・解決。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { displayNameFromArtistRow } from '@/lib/music8-artist-import';
import {
  artistNameToMusic8Slug,
  formatArtistDisplayName,
  getMusic8ArtistJsonUrlCandidates,
  type Music8ArtistJson,
} from '@/lib/music8-artist-display';
import { stripLeadingArticleForSort } from '@/lib/admin-library-index';

const MUSIC8_ARTISTS_BASE_FALLBACK =
  'https://xs867261.xsrv.jp/data/data/artists';

/** 先頭 The/A/An を除いた比較用キー（小文字） */
export function artistNameMatchKey(name: string): string {
  return stripLeadingArticleForSort(name).toLowerCase();
}

/** グループ内の表記がプレフィックス違いだけか（別バンド混入は false） */
export function isPrefixOnlyArtistNameVariant(names: string[]): boolean {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  if (trimmed.length <= 1) return true;
  const keys = new Set(trimmed.map(artistNameMatchKey));
  return keys.size === 1;
}

export function buildSongDisplayTitle(mainArtist: string, songTitle: string): string {
  const artist = mainArtist.trim();
  const title = songTitle.trim();
  if (!artist && !title) return '';
  if (!title) return artist;
  if (!artist) return title;
  return `${artist} - ${title}`;
}

/** The/A/An 付き表記があればそれを優先（Music8 thePrefix の反映） */
export function pickCanonicalFromPrefixVariants(names: string[]): string {
  const trimmed = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const withLeading = trimmed.filter((n) => /^(the|a|an)\s+/i.test(n));
  if (withLeading.length >= 1) {
    return withLeading.sort((a, b) => b.length - a.length)[0];
  }
  const counts = new Map<string, number>();
  for (const n of trimmed) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best = '';
  let max = -1;
  for (const [n, c] of counts) {
    const hasUpper = /[A-Z]/.test(n);
    const hasLower = /[a-z]/.test(n);
    const capBonus = hasUpper && hasLower ? 1000 : hasUpper ? 100 : 0;
    const score = c + capBonus;
    if (score > max) {
      max = score;
      best = n;
    }
  }
  return best;
}

/** 先頭 The/A/An の付与だけを正規化対象とみなす（同一 match key） */
export function shouldNormalizePrefixOnlyArtistName(from: string, to: string): boolean {
  const a = from.trim();
  const b = to.trim();
  if (!a || !b || a === b) return false;
  if (artistNameMatchKey(a) !== artistNameMatchKey(b)) return false;
  return /^(the|a|an)\s+/i.test(b) && !/^(the|a|an)\s+/i.test(a);
}

function getArtistThePrefix(artist: Music8ArtistJson): string | null {
  const raw = artist as Record<string, unknown>;
  const acf = raw.acf;
  const acfObj =
    acf && typeof acf === 'object' && !Array.isArray(acf) ? (acf as Record<string, unknown>) : null;
  const tp = artist.thePrefix ?? acfObj?.the_prefix ?? acfObj?.thePrefix;
  return typeof tp === 'string' && tp.trim() ? tp.trim() : null;
}

export function canonicalNameFromMusic8ArtistJson(artist: Music8ArtistJson): string | null {
  const base = (artist.name ?? '').trim();
  if (!base) return null;
  return formatArtistDisplayName(base, getArtistThePrefix(artist)) || null;
}

export type FetchJsonFn = <T>(url: string) => Promise<T | null>;

async function fetchArtistJsonBySlug(
  slug: string,
  fetchJson?: FetchJsonFn,
): Promise<Music8ArtistJson | null> {
  const s = slug.trim().toLowerCase();
  if (!s) return null;
  const fetcher =
    fetchJson ??
    (async <T>(url: string): Promise<T | null> => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        return (await res.json()) as T;
      } catch {
        return null;
      }
    });

  const urls = [
    `https://storage.googleapis.com/music8-json-prod/data/artists/${encodeURIComponent(s)}.json`,
    `${MUSIC8_ARTISTS_BASE_FALLBACK}/${encodeURIComponent(s)}.json`,
    ...getMusic8ArtistJsonUrlCandidates(s.replace(/-/g, ' ')),
  ];
  const seen = new Set<string>();
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    const json = await fetcher<Music8ArtistJson>(url);
    if (json && typeof json.name === 'string' && json.name.trim()) {
      return json;
    }
  }
  return null;
}

/**
 * slug に対する正式な main_artist 表示名。
 * 1) artists テーブル（slug 一致） 2) Music8 アーティスト JSON 3) fallbackMostCommon
 */
/** `songs.music8_song_data`（persist 後）から primary_artist_name を取得 */
export function primaryArtistNameFromMusic8Snapshot(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const top = payload.primary_artist_name;
  if (typeof top === 'string' && top.trim()) return top.trim();
  const display = payload.display;
  if (display && typeof display === 'object' && !Array.isArray(display)) {
    const p = (display as Record<string, unknown>).primary_artist_name;
    if (typeof p === 'string' && p.trim()) return p.trim();
  }
  return null;
}

/** persist スナップショットから Music8 artist slug */
export function music8ArtistSlugFromPersistedSnapshot(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const sk = payload.stable_key;
  if (sk && typeof sk === 'object' && !Array.isArray(sk)) {
    const slug = (sk as Record<string, unknown>).artist_slug;
    if (typeof slug === 'string' && slug.trim()) return slug.trim().toLowerCase();
  }
  if (Array.isArray(payload.main_artists)) {
    for (const a of payload.main_artists as unknown[]) {
      const o = a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, unknown>) : null;
      if (o && typeof o.slug === 'string' && o.slug.trim()) return o.slug.trim().toLowerCase();
    }
  }
  return null;
}

/**
 * 曲 upsert 用の main_artist（Music8 WP と同系）。
 * 1) 曲 JSON の primary_artist_name 2) slug → artists / Music8 アーティスト JSON 3) YouTube 表記
 * slug は YouTube からでも先頭 The/A/An を除いて生成（`artistNameToMusic8Slug`）。
 */
export async function resolveMainArtistForNewSongRegistration(params: {
  youtubeMainArtist: string | null | undefined;
  music8SongSnapshot?: Record<string, unknown> | null;
  admin?: SupabaseClient | null;
  fetchJson?: FetchJsonFn;
}): Promise<{ mainArtist: string | null; music8ArtistSlug: string | null }> {
  const youtube = (params.youtubeMainArtist ?? '').trim();
  const snap = params.music8SongSnapshot ?? null;

  const fromSnapName = primaryArtistNameFromMusic8Snapshot(snap);
  const slugFromSnap = music8ArtistSlugFromPersistedSnapshot(snap);
  const slugFromYoutube = youtube ? artistNameToMusic8Slug(youtube) : '';
  const slug = slugFromSnap || slugFromYoutube || null;

  if (fromSnapName) {
    return { mainArtist: fromSnapName, music8ArtistSlug: slug };
  }

  if (slug) {
    const canon = await resolveCanonicalMainArtistName({
      artistSlug: slug,
      admin: params.admin ?? null,
      fetchJson: params.fetchJson,
      fallbackMostCommon: youtube || null,
    });
    if (canon) {
      return { mainArtist: canon, music8ArtistSlug: slug };
    }
  }

  if (youtube) {
    return { mainArtist: youtube, music8ArtistSlug: slug };
  }
  return { mainArtist: null, music8ArtistSlug: slug };
}

export async function resolveCanonicalMainArtistName(params: {
  artistSlug: string;
  admin?: SupabaseClient | null;
  fetchJson?: FetchJsonFn;
  /** JSON / artists が無いときの最多表記 */
  fallbackMostCommon?: string | null;
}): Promise<string | null> {
  const slug = params.artistSlug.trim().toLowerCase();
  if (!slug) return null;

  if (params.admin) {
    const { data, error } = await params.admin
      .from('artists')
      .select('name, name_base, the_prefix')
      .eq('music8_artist_slug', slug)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      const fromRow = displayNameFromArtistRow(
        data as { name?: string | null; name_base?: string | null; the_prefix?: string | null },
      );
      if (fromRow) return fromRow;
    }
  }

  const json = await fetchArtistJsonBySlug(slug, params.fetchJson);
  const fromJson = json ? canonicalNameFromMusic8ArtistJson(json) : null;
  if (fromJson) return fromJson;

  const fb = (params.fallbackMostCommon ?? '').trim();
  return fb || null;
}
