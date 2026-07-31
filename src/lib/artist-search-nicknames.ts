/**
 * ライブラリ検索用: 愛称・略称 → 正規アーティスト名の展開。
 * マスタは `src/config/artist-search-nicknames.json`（編集後は再ビルド要）。
 */

import artistSearchNicknames from '@/config/artist-search-nicknames.json';

export type ArtistSearchNicknameEntry = {
  /** 優先表示・DB `artists.name` に近い正規表記 */
  canonical: string;
  /** 和名表記（`artists.name_ja` 突合・検索語展開） */
  nameJa?: string[];
  /** ファン・メディアで通じる愛称・略称 */
  nicknames: string[];
  /** 追加で ilike する表記（英語別名など） */
  alsoSearch?: string[];
};

type NicknameHit = {
  canonical: string;
  /** ilike / 優先表示用に足す語 */
  expandNames: string[];
};

/** 中点・空白・ハイフン等を除いた照合キー */
export function compactArtistSearchNicknameKey(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[・･\u30FB\s\u3000\-–—'.．。]/g, '')
    .toLowerCase()
    .trim();
}

function parseEntries(): ArtistSearchNicknameEntry[] {
  const raw = artistSearchNicknames as unknown;
  if (!Array.isArray(raw)) return [];
  const out: ArtistSearchNicknameEntry[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const row = x as Record<string, unknown>;
    const canonical = typeof row.canonical === 'string' ? row.canonical.trim() : '';
    if (!canonical) continue;
    const nicknames = Array.isArray(row.nicknames)
      ? row.nicknames
          .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
          .map((a) => a.trim())
      : [];
    const nameJa = Array.isArray(row.nameJa)
      ? row.nameJa
          .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
          .map((a) => a.trim())
      : [];
    const alsoSearch = Array.isArray(row.alsoSearch)
      ? row.alsoSearch
          .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
          .map((a) => a.trim())
      : [];
    if (nicknames.length === 0 && nameJa.length === 0 && alsoSearch.length === 0) continue;
    out.push({
      canonical,
      nicknames,
      nameJa: nameJa.length > 0 ? nameJa : undefined,
      alsoSearch: alsoSearch.length > 0 ? alsoSearch : undefined,
    });
  }
  return out;
}

function uniqPreserve(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const t = n.trim();
    if (!t) continue;
    const k = compactArtistSearchNicknameKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function buildLookup(): Map<string, NicknameHit> {
  const map = new Map<string, NicknameHit>();
  for (const entry of parseEntries()) {
    const expandNames = uniqPreserve([
      entry.canonical,
      ...(entry.nameJa ?? []),
      ...(entry.alsoSearch ?? []),
      ...entry.nicknames,
    ]);

    const hit: NicknameHit = { canonical: entry.canonical, expandNames };
    for (const label of expandNames) {
      const k = compactArtistSearchNicknameKey(label);
      if (!k || map.has(k)) continue;
      map.set(k, hit);
    }
  }
  return map;
}

const BY_COMPACT_KEY = buildLookup();

/** クエリ全体が愛称／和名／正規名に一致すればヒット（部分一致はしない） */
export function lookupArtistSearchNickname(rawQuery: string): NicknameHit | null {
  const q = rawQuery.trim();
  if (!q) return null;
  return BY_COMPACT_KEY.get(compactArtistSearchNicknameKey(q)) ?? null;
}

/** 検索語バリエーションに足す表記（ヒット時のみ） */
export function expandArtistSearchNicknameVariants(rawQuery: string): string[] {
  return lookupArtistSearchNickname(rawQuery)?.expandNames ?? [];
}

/** 優先表示用の正規 `main_artist`（ヒット時のみ） */
export function resolveArtistSearchNicknameCanonical(rawQuery: string): string | null {
  return lookupArtistSearchNickname(rawQuery)?.canonical ?? null;
}

/** マスタ全件（シード SQL 生成・管理用） */
export function listArtistSearchNicknameEntries(): ArtistSearchNicknameEntry[] {
  return parseEntries();
}

/** PostgREST `aliases.cs.{"…"}` 用（配列要素の完全一致） */
export function artistAliasesContainsOrFilter(alias: string): string | null {
  const t = alias.trim();
  if (!t) return null;
  const escaped = t.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `aliases.cs.{"${escaped}"}`;
}
