/**
 * Wikipedia ページスラッグ検索（Music8 WP `fetch_wikipedia_page_for_artist` 同系）
 * 洋楽は英語版（en.wikipedia.org）、邦楽は日本語版優先。
 */

import { extractEnglishArtistNameFromDescription } from '@/lib/artist-english-name';

export type WikipediaPageSearchResult =
  | { ok: true; wikipediaPage: string; url: string; lang: 'en' | 'ja' }
  | { ok: false; error: string };

export type WikipediaSearchQuery = { lang: 'en' | 'ja'; q: string };

const JAPANESE_SCRIPT = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

export function wikiSlugFromUrl(wikiUrl: string): string | null {
  const m = wikiUrl.match(/^https?:\/\/[^/]+\/wiki\/(.+)$/i);
  if (!m?.[1]) return null;
  try {
    const slug = decodeURIComponent(m[1].trim());
    return slug || null;
  } catch {
    return m[1].trim() || null;
  }
}

/**
 * 検索順の計画。
 * - western / unknown（洋楽主）: **英語版のみ**（https://en.wikipedia.org ）
 * - domestic: 日本語版優先 → 英語版フォールバック
 */
export function buildWikipediaSearchPlan(params: {
  artistName: string;
  nameJa?: string | null;
  descriptionEn?: string | null;
  catalog?: 'domestic' | 'western' | 'unknown' | null;
}): WikipediaSearchQuery[] {
  const artistName = params.artistName.trim();
  if (!artistName) return [];

  const catalogRaw = (params.catalog ?? '').trim().toLowerCase();
  const isDomestic =
    catalogRaw === 'domestic' ||
    (catalogRaw !== 'western' && catalogRaw !== 'unknown' && JAPANESE_SCRIPT.test(artistName));

  const queries: WikipediaSearchQuery[] = [];
  const enFromBio = extractEnglishArtistNameFromDescription(params.descriptionEn);

  if (isDomestic) {
    queries.push({ lang: 'ja', q: artistName });
    if (params.nameJa?.trim() && params.nameJa.trim() !== artistName) {
      queries.push({ lang: 'ja', q: params.nameJa.trim() });
    }
    // 邦楽でも英語名があれば en も試す
    queries.push({ lang: 'en', q: artistName });
    if (enFromBio && enFromBio.toLowerCase() !== artistName.toLowerCase()) {
      queries.push({ lang: 'en', q: enFromBio });
    }
    return dedupeQueries(queries);
  }

  // 洋楽（western / unknown）: 英語版 Wikipedia のみ
  queries.push({ lang: 'en', q: artistName });
  if (enFromBio && enFromBio.toLowerCase() !== artistName.toLowerCase()) {
    queries.push({ lang: 'en', q: enFromBio });
  }
  return dedupeQueries(queries);
}

function dedupeQueries(queries: WikipediaSearchQuery[]): WikipediaSearchQuery[] {
  const seen = new Set<string>();
  const out: WikipediaSearchQuery[] = [];
  for (const { lang, q } of queries) {
    const key = `${lang}:${q.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ lang, q });
  }
  return out;
}

async function opensearchFirstHit(
  lang: 'en' | 'ja',
  query: string,
): Promise<{ title: string; url: string } | null> {
  const q = query.trim();
  if (!q) return null;

  const host = lang === 'ja' ? 'ja.wikipedia.org' : 'en.wikipedia.org';
  const params = new URLSearchParams({
    action: 'opensearch',
    search: q,
    limit: '5',
    format: 'json',
    origin: '*',
  });

  const res = await fetch(`https://${host}/w/api.php?${params.toString()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as unknown;
  if (!Array.isArray(data) || data.length < 4) return null;

  const titles = data[1];
  const urls = data[3];
  if (!Array.isArray(titles) || !Array.isArray(urls) || urls.length === 0) return null;

  const url = typeof urls[0] === 'string' ? urls[0] : '';
  const title = typeof titles[0] === 'string' ? titles[0] : '';
  if (!url) return null;
  return { title, url };
}

export async function searchWikipediaPageForArtist(params: {
  artistName: string;
  nameJa?: string | null;
  descriptionEn?: string | null;
  catalog?: 'domestic' | 'western' | 'unknown' | null;
}): Promise<WikipediaPageSearchResult> {
  const artistName = params.artistName.trim();
  if (!artistName) {
    return { ok: false, error: 'アーティスト名が空です。' };
  }

  const queries = buildWikipediaSearchPlan(params);
  for (const { lang, q } of queries) {
    try {
      const hit = await opensearchFirstHit(lang, q);
      if (!hit) continue;
      const slug = wikiSlugFromUrl(hit.url);
      if (!slug) continue;
      return { ok: true, wikipediaPage: slug, url: hit.url, lang };
    } catch {
      continue;
    }
  }

  return { ok: false, error: '該当する Wikipedia ページが見つかりませんでした。' };
}
