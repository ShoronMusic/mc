/**
 * 気に入り軸ラボ: 軸 ID・スコアセル・種曲／候補の型。
 * @see docs/00-liked-song-axis-explore.md
 */

export const LIKED_SONG_AXIS_IDS = [
  'artist',
  'genre',
  'style',
  'era',
  'mood',
  'performance',
  'trend',
  'vocal',
] as const;

export type LikedSongAxisId = (typeof LIKED_SONG_AXIS_IDS)[number];

export const LIKED_SONG_AXIS_LABELS: Record<LikedSongAxisId, string> = {
  artist: 'アーティスト',
  genre: 'ジャンル',
  style: 'スタイル',
  era: '時代',
  mood: '曲調',
  performance: '演奏',
  trend: 'トレンド',
  vocal: 'ボーカル',
};

export const LIKED_SONG_POLARITIES = [
  'same',
  'more_intense',
  'more_mellow',
  'earlier',
  'later',
  'adjacent',
  'other',
] as const;

export type LikedSongPolarity = (typeof LIKED_SONG_POLARITIES)[number];

export const LIKED_SONG_POLARITY_LABELS: Record<LikedSongPolarity, string> = {
  same: '同じ温度感',
  more_intense: 'より激しい',
  more_mellow: 'より穏やか',
  earlier: '少し前',
  later: '少し後',
  adjacent: '隣接',
  other: 'その他',
};

export type LikedSongAxisScoreSource = 'catalog' | 'ai';

export type LikedSongAxisCell = {
  score: number;
  source: LikedSongAxisScoreSource;
  label: string;
  raw?: Record<string, unknown>;
};

export type LikedSongAxisScoreMap = Record<LikedSongAxisId, LikedSongAxisCell | null>;

export type SongAxisFacts = {
  artist: string;
  title: string;
  year: number | null;
  genres: string[];
  style: string | null;
  vocal: string | null;
  recordingKind: string | null;
};

export type LikedSongAxisSeed = SongAxisFacts & {
  videoId: string | null;
  watchUrl: string | null;
  songId: string | null;
  displayLabel: string;
  music8FactsBlock: string | null;
  inMcDb: boolean;
  inMusic8: boolean;
};

export type LikedSongSalientAxis = {
  id: LikedSongAxisId;
  label: string;
  why: string;
};

export type LikedSongAxisCatalogHit = {
  inMcDb: boolean;
  inMusic8: boolean;
  songId: string | null;
  videoId: string | null;
  watchUrl: string | null;
};

export type LikedSongAxisCandidate = {
  artist: string;
  title: string;
  axis: LikedSongAxisId;
  polarity: LikedSongPolarity;
  reasonLabel: string;
  reason: string;
  youtubeSearchQuery: string;
  catalog: LikedSongAxisCatalogHit;
  composite: number | null;
  axes: LikedSongAxisScoreMap;
};

export type LikedSongAxisLabResult = {
  seed: LikedSongAxisSeed;
  salientAxes: LikedSongSalientAxis[];
  candidates: LikedSongAxisCandidate[];
  model: string | null;
  warnings: string[];
};
