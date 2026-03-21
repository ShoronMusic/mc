/**
 * 「&」「and」を含んでも**1組のアーティスト名**として扱う一覧。
 * ref/YTtoWP-YouTube動画をWP新規投稿で開く.js の exclusionArtists をベースに、
 * 本プロジェクト用の追加分を含む。
 *
 * 照合は大文字小文字無視。`and` と `&` は同一視してマッチする。
 *
 * **マスタは `src/config/artist-compound-extra.json` のみ**（編集後は再ビルド要）。
 */

import artistCompoundExtra from '@/config/artist-compound-extra.json';

function readCompoundNamesFromConfig(): readonly string[] {
  const raw = artistCompoundExtra as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

/** 表示は配列の先頭寄りの表記を優先（& 表記を推奨して並べる）。中身は JSON と同一。 */
export const ARTIST_NAMES_KEEP_AMPERSAND_AND: readonly string[] = readCompoundNamesFromConfig();

/** 比較用: 小文字・空白正規化・and→& */
export function normArtistCompoundKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+and\s+/g, ' & ');
}

function buildCompoundCanonicalMap(): Map<string, string> {
  const m = new Map<string, string>();
  for (const name of ARTIST_NAMES_KEEP_AMPERSAND_AND) {
    const k = normArtistCompoundKey(name);
    if (!m.has(k)) m.set(k, name);
  }
  return m;
}

const COMPOUND_CANONICAL_BY_NORM = buildCompoundCanonicalMap();

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
