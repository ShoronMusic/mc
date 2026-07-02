import type { SupabaseClient } from '@supabase/supabase-js';
import { formatArtistTitle, getArtistAndSong } from '@/lib/format-song-display';

export type UserSongPickExclude = {
  artist: string;
  song: string;
};

export type CharacterSongPickExcludeBundle = {
  excludeVideoIds: string[];
  recentUserPicks: UserSongPickExclude[];
  /** Gemini プロンプト用（参加者の直近選曲ラベル） */
  recentUserSongLabels: string[];
  /** AI 自身の直近選曲（曲名重複回避・YouTube 解決フィルタ用） */
  recentAiPicks: UserSongPickExclude[];
  /** AI 自身が直近かけたアーティスト（同一アーティスト連打回避） */
  recentAiArtists: string[];
  /** Gemini プロンプト用（AI 自身の直近選曲ラベル） */
  recentAiSongLabels: string[];
};

const DEFAULT_MAX_USER_PICKS = 120;
const DEFAULT_MAX_AI_PICKS = 60;

const ARTIST_TOKEN_SPLIT = /\s*(?:,|&| feat\.?| ft\.?| featuring | x | × )\s*/i;

function normalizeForMatch(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/** 視聴履歴・YouTube ヒット間で同一曲とみなすか */
export function isSameSongForPick(
  rowArtist: string | null | undefined,
  rowSong: string | null | undefined,
  artist: string,
  song: string,
): boolean {
  const na = normalizeForMatch(rowArtist);
  const ns = normalizeForMatch(rowSong);
  const pa = normalizeForMatch(artist);
  const ps = normalizeForMatch(song);
  if (!na || na !== pa) return false;
  if (!ns && !ps) return true;
  if (!ns || !ps) return false;
  return ns.includes(ps) || ps.includes(ns);
}

export function matchesExcludedUserSongPick(
  artist: string,
  song: string,
  recentUserPicks: readonly UserSongPickExclude[],
): boolean {
  for (const pick of recentUserPicks) {
    if (isSameSongForPick(pick.artist, pick.song, artist, song)) return true;
  }
  return false;
}

export function matchesExcludedUserSongArtistTitle(
  artistTitle: string,
  recentUserPicks: readonly UserSongPickExclude[],
): boolean {
  const parsed = getArtistAndSong(artistTitle, null);
  const artist = (parsed.artist ?? '').trim();
  const song = (parsed.song ?? '').trim();
  if (!artist && !song) return false;
  return matchesExcludedUserSongPick(artist, song, recentUserPicks);
}

function normalizeSongTitleOnly(s: string | null | undefined): string {
  return (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** AI 自身の選曲重複: ライブ版等を除いた曲名が一致すれば同一曲とみなす */
export function isSameSongTitleForAiPick(
  rowSong: string | null | undefined,
  song: string,
): boolean {
  const ns = normalizeSongTitleOnly(rowSong);
  const ps = normalizeSongTitleOnly(song);
  if (!ns || !ps || ns.length < 4 || ps.length < 4) return false;
  return ns === ps || ns.includes(ps) || ps.includes(ns);
}

export function matchesExcludedAiSongPick(
  artist: string,
  song: string,
  recentAiPicks: readonly UserSongPickExclude[],
): boolean {
  for (const pick of recentAiPicks) {
    if (isSameSongForPick(pick.artist, pick.song, artist, song)) return true;
    if (isSameSongTitleForAiPick(pick.song, song)) return true;
  }
  return false;
}

export function matchesExcludedAiSongArtistTitle(
  artistTitle: string,
  recentAiPicks: readonly UserSongPickExclude[],
): boolean {
  const parsed = getArtistAndSong(artistTitle, null);
  const artist = (parsed.artist ?? '').trim();
  const song = (parsed.song ?? '').trim();
  if (!artist && !song) return false;
  return matchesExcludedAiSongPick(artist, song, recentAiPicks);
}

export function splitArtistTokens(artist: string | null | undefined): string[] {
  const raw = (artist ?? '').trim();
  if (!raw) return [];
  return raw
    .split(ARTIST_TOKEN_SPLIT)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export function matchesExcludedArtist(
  artist: string,
  excludedArtists: readonly string[],
): boolean {
  if (excludedArtists.length === 0) return false;
  const excludedNorm = new Set(
    excludedArtists.map((a) => normalizeForMatch(a)).filter(Boolean),
  );
  const candidates = splitArtistTokens(artist);
  if (candidates.length === 0) {
    const norm = normalizeForMatch(artist);
    return Boolean(norm && excludedNorm.has(norm));
  }
  for (const c of candidates) {
    const nc = normalizeForMatch(c);
    if (nc && excludedNorm.has(nc)) return true;
  }
  const fullNorm = normalizeForMatch(artist);
  return Boolean(fullNorm && excludedNorm.has(fullNorm));
}

function pickLabelFromRow(artistName: string | null | undefined, title: string | null | undefined): string | null {
  const artist = (artistName ?? '').trim();
  const song = (title ?? '').trim();
  if (artist && song) return formatArtistTitle(`${artist} - ${song}`, null) || `${artist} - ${song}`;
  if (song) return song;
  return null;
}

function addArtistTokens(
  artists: string[],
  artistKeys: Set<string>,
  artistName: string | null | undefined,
): void {
  for (const token of splitArtistTokens(artistName)) {
    const key = normalizeForMatch(token);
    if (key && !artistKeys.has(key)) {
      artistKeys.add(key);
      artists.push(token);
    }
  }
}

function addUserPick(
  picks: UserSongPickExclude[],
  pickKeys: Set<string>,
  labels: string[],
  labelKeys: Set<string>,
  artistName: string | null | undefined,
  title: string | null | undefined,
): void {
  const artist = (artistName ?? '').trim();
  const song = (title ?? '').trim();
  if (!artist && !song) return;
  const key = `${normalizeForMatch(artist)}|${normalizeForMatch(song)}`;
  if (!pickKeys.has(key)) {
    pickKeys.add(key);
    picks.push({ artist: artist || 'Unknown', song: song || artist });
  }
  const label = pickLabelFromRow(artistName, title);
  if (label) {
    const labelKey = normalizeForMatch(label);
    if (!labelKeys.has(labelKey)) {
      labelKeys.add(labelKey);
      labels.push(label);
    }
  }
}

type HistoryRow = {
  video_id?: string | null;
  display_name?: string | null;
  title?: string | null;
  artist_name?: string | null;
  played_at?: string | null;
};

/**
 * 部屋の視聴履歴から AI 選曲時に除外する videoId と直近選曲を集める。
 * 参加者（非AI）の曲名・AI 自身の曲名・アーティスト重複を別々に扱う。
 */
export async function buildCharacterSongPickExcludes(
  supabase: SupabaseClient,
  roomId: string,
  opts?: {
    aiCharacterDisplayName?: string;
    nowPlayingVideoId?: string;
    maxUserPicks?: number;
    maxAiPicks?: number;
    /** 指定時は AI 自身の除外リストをこの時刻以降の選曲に限定（入室セッション用） */
    aiHistorySinceIso?: string;
  },
): Promise<CharacterSongPickExcludeBundle> {
  const maxUserPicks = opts?.maxUserPicks ?? DEFAULT_MAX_USER_PICKS;
  const maxAiPicks = opts?.maxAiPicks ?? DEFAULT_MAX_AI_PICKS;
  const aiName = (opts?.aiCharacterDisplayName ?? '').trim();
  const aiHistorySince = (opts?.aiHistorySinceIso ?? '').trim();
  const excludeVideoIds = new Set<string>();
  const recentUserPicks: UserSongPickExclude[] = [];
  const pickKeys = new Set<string>();
  const recentUserSongLabels: string[] = [];
  const labelKeys = new Set<string>();
  const recentAiPicks: UserSongPickExclude[] = [];
  const aiPickKeys = new Set<string>();
  const recentAiSongLabels: string[] = [];
  const aiLabelKeys = new Set<string>();
  const recentAiArtists: string[] = [];
  const aiArtistKeys = new Set<string>();

  const nowPlaying = (opts?.nowPlayingVideoId ?? '').trim();
  if (nowPlaying) excludeVideoIds.add(nowPlaying);

  const { data: roomHistoryRows, error } = await supabase
    .from('room_playback_history')
    .select('video_id, display_name, title, artist_name, played_at')
    .eq('room_id', roomId)
    .order('played_at', { ascending: false })
    .limit(maxUserPicks * 3);

  if (error && error.code !== '42P01') {
    console.warn('[character-song-pick-exclude] room_playback_history read failed', error.message);
  } else if (Array.isArray(roomHistoryRows)) {
    for (const row of roomHistoryRows as HistoryRow[]) {
      const vid = typeof row.video_id === 'string' ? row.video_id.trim() : '';
      const who = typeof row.display_name === 'string' ? row.display_name.trim() : '';
      const isAiPick = Boolean(aiName && who === aiName);

      if (!isAiPick) {
        if (vid) excludeVideoIds.add(vid);
        if (recentUserPicks.length < maxUserPicks) {
          addUserPick(
            recentUserPicks,
            pickKeys,
            recentUserSongLabels,
            labelKeys,
            row.artist_name,
            row.title,
          );
        }
      } else {
        if (vid) excludeVideoIds.add(vid);
        const playedAt = typeof row.played_at === 'string' ? row.played_at.trim() : '';
        if (aiHistorySince && playedAt && playedAt < aiHistorySince) continue;
        if (recentAiPicks.length < maxAiPicks) {
          addUserPick(
            recentAiPicks,
            aiPickKeys,
            recentAiSongLabels,
            aiLabelKeys,
            row.artist_name,
            row.title,
          );
          addArtistTokens(recentAiArtists, aiArtistKeys, row.artist_name);
        }
      }

      if (
        excludeVideoIds.size >= maxUserPicks &&
        recentUserPicks.length >= maxUserPicks &&
        recentAiPicks.length >= maxAiPicks
      ) {
        break;
      }
    }
  }

  return {
    excludeVideoIds: Array.from(excludeVideoIds),
    recentUserPicks,
    recentUserSongLabels,
    recentAiPicks,
    recentAiArtists,
    recentAiSongLabels,
  };
}
