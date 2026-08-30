/**
 * 種曲 vs 候補の軸スコア（カタログ測れるもの）。欠損は null（0 にしない）。
 * @see docs/00-liked-song-axis-explore.md §12
 */

import {
  LIKED_SONG_AXIS_IDS,
  type LikedSongAxisCell,
  type LikedSongAxisId,
  type LikedSongAxisScoreMap,
  type SongAxisFacts,
} from '@/lib/liked-song-axis-types';

const ERA_CAP_YEARS = 20;

const COMPOSITE_WEIGHT: Record<LikedSongAxisId, number> = {
  artist: 1.2,
  genre: 1.2,
  style: 1,
  era: 1,
  mood: 1,
  performance: 0.6,
  trend: 0.8,
  vocal: 0.6,
};

export function releaseYearFromDate(raw: string | null | undefined): number | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const m = /((?:19|20)\d{2})/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null;
  return y;
}

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizeAxisName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function emptyAxes(): LikedSongAxisScoreMap {
  return {
    artist: null,
    genre: null,
    style: null,
    era: null,
    mood: null,
    performance: null,
    trend: null,
    vocal: null,
  };
}

export function scoreArtist(seed: SongAxisFacts, cand: SongAxisFacts): LikedSongAxisCell | null {
  const a = normalizeAxisName(seed.artist);
  const b = normalizeAxisName(cand.artist);
  if (!a || !b) return null;
  const same = a === b;
  return {
    score: same ? 100 : 0,
    source: 'catalog',
    label: same ? '同じアーティスト' : '別アーティスト',
    raw: { same },
  };
}

export function scoreGenre(seed: SongAxisFacts, cand: SongAxisFacts): LikedSongAxisCell | null {
  const a = [...new Set(seed.genres.map(normalizeAxisName).filter(Boolean))];
  const b = [...new Set(cand.genres.map(normalizeAxisName).filter(Boolean))];
  if (a.length === 0 || b.length === 0) return null;
  const sa = new Set(a);
  const sb = new Set(b);
  const overlap = a.filter((x) => sb.has(x));
  const union = new Set([...sa, ...sb]);
  const jaccard = union.size === 0 ? 0 : overlap.length / union.size;
  const score = clampScore(jaccard * 100);
  const overlapLabel = overlap.slice(0, 4).join('、');
  return {
    score,
    source: 'catalog',
    label: overlap.length > 0 ? `${overlapLabel} が共通` : 'ジャンル共通なし',
    raw: { jaccard: Math.round(jaccard * 1000) / 1000, overlap },
  };
}

export function scoreStyle(seed: SongAxisFacts, cand: SongAxisFacts): LikedSongAxisCell | null {
  const a = normalizeAxisName(seed.style ?? '');
  const b = normalizeAxisName(cand.style ?? '');
  if (!a || !b) return null;
  const same = a === b;
  return {
    score: same ? 100 : 0,
    source: 'catalog',
    label: same ? a : `${seed.style} / ${cand.style}`,
    raw: { same, seed: seed.style, cand: cand.style },
  };
}

export function scoreEra(seed: SongAxisFacts, cand: SongAxisFacts): LikedSongAxisCell | null {
  if (seed.year == null || cand.year == null) return null;
  const yearDelta = Math.abs(seed.year - cand.year);
  const score = clampScore(100 * (1 - Math.min(yearDelta, ERA_CAP_YEARS) / ERA_CAP_YEARS));
  return {
    score,
    source: 'catalog',
    label: yearDelta === 0 ? '同年' : `年差 ${yearDelta}`,
    raw: { yearDelta, years: [seed.year, cand.year] },
  };
}

export function scoreVocal(seed: SongAxisFacts, cand: SongAxisFacts): LikedSongAxisCell | null {
  const a = normalizeAxisName(seed.vocal ?? '');
  const b = normalizeAxisName(cand.vocal ?? '');
  if (!a || !b) return null;
  const same = a === b;
  return {
    score: same ? 100 : 0,
    source: 'catalog',
    label: same ? a : `${seed.vocal} / ${cand.vocal}`,
    raw: { same },
  };
}

export function scorePerformance(seed: SongAxisFacts, cand: SongAxisFacts): LikedSongAxisCell | null {
  const a = normalizeAxisName(seed.recordingKind ?? '');
  const b = normalizeAxisName(cand.recordingKind ?? '');
  if (!a || !b) return null;
  const same = a === b;
  return {
    score: same ? 100 : 0,
    source: 'catalog',
    label: same ? a : `${seed.recordingKind} / ${cand.recordingKind}`,
    raw: { same },
  };
}

export function catalogAxisScores(seed: SongAxisFacts, cand: SongAxisFacts): LikedSongAxisScoreMap {
  const out = emptyAxes();
  out.artist = scoreArtist(seed, cand);
  out.genre = scoreGenre(seed, cand);
  out.style = scoreStyle(seed, cand);
  out.era = scoreEra(seed, cand);
  out.vocal = scoreVocal(seed, cand);
  out.performance = scorePerformance(seed, cand);
  return out;
}

export function aiScoreCell(score: number | null, label?: string): LikedSongAxisCell | null {
  if (score == null || !Number.isFinite(score)) return null;
  return {
    score: clampScore(score),
    source: 'ai',
    label: (label ?? '').trim() || 'AI 自己評価',
  };
}

/** カタログで測れた軸を優先。mood / trend は AI 側。 */
export function mergeAxisScores(
  catalog: LikedSongAxisScoreMap,
  ai: Partial<Record<LikedSongAxisId, number | null>>,
): LikedSongAxisScoreMap {
  const out = emptyAxes();
  for (const id of LIKED_SONG_AXIS_IDS) {
    const cat = catalog[id];
    if (cat) {
      out[id] = cat;
      continue;
    }
    const aiVal = ai[id];
    out[id] = aiScoreCell(typeof aiVal === 'number' ? aiVal : null);
  }
  return out;
}

export function compositeScore(axes: LikedSongAxisScoreMap): number | null {
  let num = 0;
  let den = 0;
  for (const id of LIKED_SONG_AXIS_IDS) {
    const cell = axes[id];
    if (!cell) continue;
    const w = COMPOSITE_WEIGHT[id];
    num += cell.score * w;
    den += w;
  }
  if (den <= 0) return null;
  return clampScore(num / den);
}

/** ヒートマップ用（0=青、100=赤）。null は呼び出し側で無色。 */
export function likedSongAxisHeatStyle(score: number | null): { backgroundColor?: string; color?: string } {
  if (score == null || !Number.isFinite(score)) return {};
  const s = clampScore(score);
  const hue = Math.round(220 - (s / 100) * 220);
  return {
    backgroundColor: `hsl(${hue} 52% 22%)`,
    color: 'rgb(248 250 252)',
  };
}
