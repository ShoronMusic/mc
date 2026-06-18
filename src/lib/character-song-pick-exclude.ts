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
};

const DEFAULT_MAX_USER_PICKS = 120;

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

function pickLabelFromRow(artistName: string | null | undefined, title: string | null | undefined): string | null {
  const artist = (artistName ?? '').trim();
  const song = (title ?? '').trim();
  if (artist && song) return formatArtistTitle(`${artist} - ${song}`, null) || `${artist} - ${song}`;
  if (song) return song;
  return null;
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
};

/**
 * 部屋の視聴履歴から AI 選曲時に除外する videoId と参加者（非AI）の直近選曲を集める。
 * AI 自身の過去選曲は videoId / 曲名ともに除外しない（aiCharacterDisplayName 指定時）。
 */
export async function buildCharacterSongPickExcludes(
  supabase: SupabaseClient,
  roomId: string,
  opts?: {
    aiCharacterDisplayName?: string;
    nowPlayingVideoId?: string;
    maxUserPicks?: number;
  },
): Promise<CharacterSongPickExcludeBundle> {
  const maxUserPicks = opts?.maxUserPicks ?? DEFAULT_MAX_USER_PICKS;
  const aiName = (opts?.aiCharacterDisplayName ?? '').trim();
  const excludeVideoIds = new Set<string>();
  const recentUserPicks: UserSongPickExclude[] = [];
  const pickKeys = new Set<string>();
  const recentUserSongLabels: string[] = [];
  const labelKeys = new Set<string>();

  const nowPlaying = (opts?.nowPlayingVideoId ?? '').trim();
  if (nowPlaying) excludeVideoIds.add(nowPlaying);

  const { data: roomHistoryRows, error } = await supabase
    .from('room_playback_history')
    .select('video_id, display_name, title, artist_name')
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
      } else if (vid) {
        // AI 自身の選曲は曲名重複は許容するが、同一 video の即リピートだけは避ける
        excludeVideoIds.add(vid);
      }

      if (excludeVideoIds.size >= maxUserPicks && recentUserPicks.length >= maxUserPicks) break;
    }
  }

  return {
    excludeVideoIds: Array.from(excludeVideoIds),
    recentUserPicks,
    recentUserSongLabels,
  };
}
