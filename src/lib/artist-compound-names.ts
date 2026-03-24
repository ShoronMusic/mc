/**
 * 「&」「and」を含んでも**1組のアーティスト名**として扱う一覧。
 * ref/YTtoWP-YouTube動画をWP新規投稿で開く.js の exclusionArtists をベースに、
 * 本プロジェクト用の追加分を含む。
 *
 * 照合は大文字小文字無視。`and` と `&` は同一視してマッチする。
 *
 * **マスタは `src/config/artist-compound-extra.json` のみ**（編集後は再ビルド要）。
 * 配列要素は文字列、または `{ "canonical": "正式名", "aliases": ["略称1", …] }`（略称も同一アーティストとして正規化）。
 */

import artistCompoundExtra from '@/config/artist-compound-extra.json';

type CompoundJsonEntry =
  | string
  | {
      canonical: string;
      aliases?: string[];
    };

/** 比較用: 小文字・空白正規化・and→& */
export function normArtistCompoundKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+and\s+/g, ' & ');
}

function parseCompoundConfig(): { canonicalNames: string[]; map: Map<string, string> } {
  const raw = artistCompoundExtra as unknown;
  const canonicalNames: string[] = [];
  const m = new Map<string, string>();

  if (!Array.isArray(raw)) {
    return { canonicalNames, map: m };
  }

  for (const x of raw as CompoundJsonEntry[]) {
    if (typeof x === 'string') {
      const n = x.trim();
      if (!n) continue;
      canonicalNames.push(n);
      const k = normArtistCompoundKey(n);
      if (!m.has(k)) m.set(k, n);
      continue;
    }
    if (x && typeof x === 'object' && typeof x.canonical === 'string') {
      const canonical = x.canonical.trim();
      const aliases = Array.isArray(x.aliases)
        ? x.aliases.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
        : [];
      if (!canonical) continue;
      canonicalNames.push(canonical);
      const ck = normArtistCompoundKey(canonical);
      if (!m.has(ck)) m.set(ck, canonical);
      for (const a of aliases) {
        const ak = normArtistCompoundKey(a.trim());
        if (!m.has(ak)) m.set(ak, canonical);
      }
    }
  }

  return { canonicalNames, map: m };
}

const { canonicalNames: COMPOUND_CANONICAL_NAMES, map: COMPOUND_CANONICAL_BY_NORM } =
  parseCompoundConfig();

/** 表示・マップ構築に使う正式名の一覧（エイリアスのみの行は含まない） */
export const ARTIST_NAMES_KEEP_AMPERSAND_AND: readonly string[] = COMPOUND_CANONICAL_NAMES;

/**
 * 全体が登録済みの「合体アーティスト名」と一致すれば、推奨表記を返す。一致しなければ null。
 * 既に「A, B」とカンマ区切りになっている場合も、& 正規化後にマッチさせる。
 */
export function compoundArtistCanonicalIfKnown(artistPart: string): string | null {
  const t = artistPart.trim();
  if (!t) return null;
  const k = normArtistCompoundKey(t);
  const hit = COMPOUND_CANONICAL_BY_NORM.get(k);
  if (hit) return hit;
  const kCommaAsAmp = normArtistCompoundKey(t.replace(/,\s+/g, ' & '));
  return COMPOUND_CANONICAL_BY_NORM.get(kCommaAsAmp) ?? null;
}
