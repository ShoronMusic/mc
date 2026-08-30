/**
 * 曲スタイルの選択肢（UI・API 共通）
 * （）内のジャンルは今後増やす想定
 */
export const SONG_STYLE_OPTIONS = [
  'Pop',
  'Dance',
  'Electronica',
  'R&B',
  'Hip-hop',
  'Alternative rock',
  'Metal',
  'Rock',
  'Jazz',
  'Other',
] as const;

export type SongStyleOption = (typeof SONG_STYLE_OPTIONS)[number];

/** Other は失敗・不明の退避値なので `song_style` に書かず、次の再生で再判定する */
export function shouldCacheAssignedSongStyle(style: SongStyleOption): boolean {
  return style !== 'Other';
}

/** 判定に使える確定スタイル（空・Other・未知ラベルは使わない） */
export function parseUsableSongStyle(raw: string | null | undefined): SongStyleOption | null {
  const t = (raw ?? '').trim();
  if (!t || t === 'Other') return null;
  return SONG_STYLE_OPTIONS.includes(t as SongStyleOption) ? (t as SongStyleOption) : null;
}

/**
 * 曲スタイル判定の優先順位（先にあるほど強い）:
 * 1. 曲マスタ `songs.style`
 * 2. video キャッシュ `song_style`
 * 3. Music8
 * 4. MusicBrainz genres
 * 5. Gemini
 */
export function pickSongStyleByPriority(opts: {
  songMasterStyle?: string | null;
  videoCacheStyle?: string | null;
  music8Style?: string | null;
  musicBrainzStyle?: string | null;
  aiStyle?: string | null;
}): SongStyleOption | null {
  return (
    parseUsableSongStyle(opts.songMasterStyle) ??
    parseUsableSongStyle(opts.videoCacheStyle) ??
    parseUsableSongStyle(opts.music8Style) ??
    parseUsableSongStyle(opts.musicBrainzStyle) ??
    parseUsableSongStyle(opts.aiStyle)
  );
}
