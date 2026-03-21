/**
 * Music8 のアーティスト JSON / 曲スラッグ用に、サイト側の「メインアーティスト」名を置き換える。
 * 表示や DB の artist 表記は変えず、取得 URL だけ別名にする。
 *
 * 対応表は `src/config/music8-main-artist-aliases.json`（再ビルド要）。
 */

import music8MainArtistAliases from '@/config/music8-main-artist-aliases.json';
import { normArtistCompoundKey } from '@/lib/artist-compound-names';

type Music8AliasRow = { from?: unknown; music8As?: unknown };

/** 正規化キー → Music8 上で検索するアーティスト名 */
function buildMusic8MainArtistLookup(): Map<string, string> {
  const m = new Map<string, string>();
  const raw = music8MainArtistAliases as unknown;
  if (!Array.isArray(raw)) return m;
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Music8AliasRow;
    if (typeof r.from !== 'string' || typeof r.music8As !== 'string') continue;
    const from = r.from.trim();
    const to = r.music8As.trim();
    if (!from || !to) continue;
    m.set(normArtistCompoundKey(from), to);
  }
  return m;
}

const MUSIC8_MAIN_BY_NORM = buildMusic8MainArtistLookup();

/**
 * Music8 の slug / JSON 取得用のアーティスト名。未登録なら入力をそのまま返す。
 */
export function resolveArtistNameForMusic8Lookup(artistName: string): string {
  const t = (artistName ?? '').trim();
  if (!t) return t;
  const hit = MUSIC8_MAIN_BY_NORM.get(normArtistCompoundKey(t));
  return hit ?? t;
}
