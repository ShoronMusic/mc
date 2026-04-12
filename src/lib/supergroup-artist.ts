import supergroupArtistHints from '@/config/supergroup-artist-hints.json';
import { normArtistCompoundKey } from '@/lib/artist-compound-names';
import { getMusic8ArtistJsonUrl } from '@/lib/music8-artist-display';

type HintEntry = string | { canonical?: unknown; aliases?: unknown };

function buildManualHintSet(): Set<string> {
  const out = new Set<string>();
  const raw = supergroupArtistHints as unknown;
  if (!Array.isArray(raw)) return out;
  for (const row of raw as HintEntry[]) {
    if (typeof row === 'string') {
      const s = row.trim();
      if (s) out.add(normArtistCompoundKey(s));
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const canonical = typeof row.canonical === 'string' ? row.canonical.trim() : '';
    if (canonical) out.add(normArtistCompoundKey(canonical));
    const aliases = Array.isArray(row.aliases) ? row.aliases : [];
    for (const a of aliases) {
      if (typeof a !== 'string') continue;
      const s = a.trim();
      if (s) out.add(normArtistCompoundKey(s));
    }
  }
  return out;
}

const SUPERGROUP_MANUAL_SET = buildManualHintSet();

type ExternalCacheValue = { hit: boolean; expiresAt: number };
const EXT_CACHE = new Map<string, ExternalCacheValue>();
const EXT_TTL_MS = 6 * 60 * 60 * 1000;

export function isSupergroupByManualHints(artistName: string): boolean {
  const t = (artistName ?? '').trim();
  if (!t) return false;
  return SUPERGROUP_MANUAL_SET.has(normArtistCompoundKey(t));
}

async function isSupergroupByMusic8Description(artistName: string): Promise<boolean> {
  const key = normArtistCompoundKey((artistName ?? '').trim());
  if (!key) return false;
  const now = Date.now();
  const cached = EXT_CACHE.get(key);
  if (cached && cached.expiresAt > now) return cached.hit;

  let hit = false;
  try {
    const url = getMusic8ArtistJsonUrl(artistName);
    if (!url) {
      EXT_CACHE.set(key, { hit: false, expiresAt: now + EXT_TTL_MS });
      return false;
    }
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const j = (await res.json()) as Record<string, unknown>;
      const acf = (j.acf && typeof j.acf === 'object' ? j.acf : {}) as Record<string, unknown>;
      const desc = typeof j.description === 'string' ? j.description : '';
      const acfDesc = typeof acf.description === 'string' ? acf.description : '';
      const merged = `${desc}\n${acfDesc}`;
      hit = /\bsupergroup\b|スーパーグループ/i.test(merged);
    }
  } catch {
    hit = false;
  }
  EXT_CACHE.set(key, { hit, expiresAt: now + EXT_TTL_MS });
  return hit;
}

export async function buildSupergroupPromptBlock(artistName: string): Promise<string> {
  const name = (artistName ?? '').trim();
  if (!name) return '';
  if (isSupergroupByManualHints(name) || (await isSupergroupByMusic8Description(name))) {
    return `【ユニット背景（必須）】
・「${name}」は固定バンドとして断定せず、人気バンド／人気アーティストのメンバーが参加したプロジェクト（スーパーグループ）である可能性を踏まえて、**結成背景・参加メンバーの文脈**を1文入れてください。
・**チャート・ヒットの規模・社会的反響より**、広く知られた範囲で**各主要メンバーの氏名（通称可）と、世に知られる元所属バンド名／ソロ名**を優先して触れてください（列挙が長くなるときは自由コメント1本目に任せ、基本情報では端折してよい）。
・メンバー名や元所属を挙げる場合は、広く知られた事実の範囲に限り、不確実な情報は断定しないこと。
`;
  }
  return '';
}
