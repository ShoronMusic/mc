/**
 * 「&」「and」を含んでも**1組のアーティスト名**として扱う一覧。
 * ref/YTtoWP-YouTube動画をWP新規投稿で開く.js および
 * chrome-extension-yttowp/content.js の exclusionArtists をベースに、
 * 本プロジェクト用の追加分を含む。
 *
 * 照合は大文字小文字無視。`and` と `&` は同一視してマッチする。
 *
 * **マスタは `src/config/artist-compound-extra.json` のみ**（編集後は再ビルド要）。
 * Chrome 拡張（yttowp / yttom7）へは `E:\wp\scripts\sync-exclusion-artists.mjs` で同梱 JSON を同期する。
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
    .replace(/&amp;/gi, '&')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+and\s+/g, ' & ');
}

function parseCompoundConfig(): {
  canonicalNames: string[];
  map: Map<string, string>;
  surfaces: { surface: string; canonical: string }[];
} {
  const raw = artistCompoundExtra as unknown;
  const canonicalNames: string[] = [];
  const m = new Map<string, string>();
  const surfaces: { surface: string; canonical: string }[] = [];

  if (!Array.isArray(raw)) {
    return { canonicalNames, map: m, surfaces };
  }

  const pushSurface = (surface: string, canonical: string) => {
    const s = surface.trim();
    if (!s) return;
    surfaces.push({ surface: s, canonical });
  };

  for (const x of raw as CompoundJsonEntry[]) {
    if (typeof x === 'string') {
      const n = x.trim();
      if (!n) continue;
      canonicalNames.push(n);
      const k = normArtistCompoundKey(n);
      if (!m.has(k)) m.set(k, n);
      pushSurface(n, n);
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
      pushSurface(canonical, canonical);
      for (const a of aliases) {
        const ak = normArtistCompoundKey(a.trim());
        if (!m.has(ak)) m.set(ak, canonical);
        pushSurface(a, canonical);
      }
    }
  }

  return { canonicalNames, map: m, surfaces };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `and` と `&` を同一視した部分一致。長い名前を先に置換する。 */
function compoundSurfaceToPatternBody(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => (tok === '&' || /^and$/i.test(tok) ? '(?:&|&amp;|and)' : escapeRegExp(tok)))
    .join('\\s+');
}

function buildCompoundShieldPatterns(
  surfaces: { surface: string; canonical: string }[],
): { re: RegExp; canonical: string }[] {
  const seen = new Set<string>();
  const ranked: { re: RegExp; canonical: string; len: number }[] = [];
  for (const { surface, canonical } of surfaces) {
    const body = compoundSurfaceToPatternBody(surface);
    const key = `${body.toLowerCase()}\0${canonical}`;
    if (!body || seen.has(key)) continue;
    seen.add(key);
    ranked.push({
      re: new RegExp(`(?<![A-Za-z0-9])(?:${body})(?![A-Za-z0-9])`, 'gi'),
      canonical,
      len: surface.trim().length,
    });
  }
  ranked.sort((a, b) => b.len - a.len);
  return ranked.map(({ re, canonical }) => ({ re, canonical }));
}

const {
  canonicalNames: COMPOUND_CANONICAL_NAMES,
  map: COMPOUND_CANONICAL_BY_NORM,
  surfaces: COMPOUND_SURFACES,
} = parseCompoundConfig();

const COMPOUND_SHIELD_PATTERNS = buildCompoundShieldPatterns(COMPOUND_SURFACES);

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

const COMPOUND_SLOT_RE = /\uE000(\d+)\uE001/g;

/**
 * 共演文字列の中にある合体アーティスト名を退避する。
 * 「Tegan and Sara ft. Lights」を and で割る前に使い、退避した箇所は正式名へ戻す。
 */
export function protectCompoundArtistNames(input: string): {
  text: string;
  restore: (part: string) => string;
} {
  const slots: string[] = [];
  let text = input.replace(/&amp;/gi, '&');
  for (const { re, canonical } of COMPOUND_SHIELD_PATTERNS) {
    re.lastIndex = 0;
    text = text.replace(re, () => {
      const id = slots.length;
      slots.push(canonical);
      return `\uE000${id}\uE001`;
    });
  }
  const restore = (part: string) => {
    COMPOUND_SLOT_RE.lastIndex = 0;
    return part
      .replace(COMPOUND_SLOT_RE, (_, n: string) => slots[Number(n)] ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  };
  return { text, restore };
}
