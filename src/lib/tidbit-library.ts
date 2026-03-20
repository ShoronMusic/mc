/**
 * 豆知識ライブラリの検索・登録（Supabase 利用）
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface TidbitLibraryRow {
  id: string;
  body: string;
  video_id: string | null;
  artist_name: string | null;
  song_title: string | null;
  keywords: string | null;
  room_id: string | null;
  style: string | null;
  created_at: string;
}

export interface SearchTidbitParams {
  videoId?: string | null;
  artistName?: string | null;
  songTitle?: string | null;
  excludeIds?: string[];
  /** 指定時はこのスタイルの tidbit のみ返す（再生中曲のジャンルに合わせる） */
  currentSongStyle?: string | null;
}

function normalizeForMatch(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/** 同一曲とみなすか（アーティスト一致かつ曲名が相互に含む） */
function isSameSong(
  rowArtist: string | null | undefined,
  rowSong: string | null | undefined,
  artist: string,
  song: string
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

/** 同一アーティストとみなすか */
function isSameArtist(rowArtist: string | null | undefined, artist: string): boolean {
  return normalizeForMatch(rowArtist) === normalizeForMatch(artist);
}

/**
 * ライブラリから 1 件を選ぶ。
 * 検索順: ① 同一曲（アーティスト - 曲名で、videoId に依存しない）→ ② 同一アーティストの豆知識。excludeIds は除外。ヒットしなければ null。
 */
export async function searchTidbitFromLibrary(
  supabase: SupabaseClient | null,
  params: SearchTidbitParams
): Promise<TidbitLibraryRow | null> {
  if (!supabase) return null;

  const { videoId, artistName, songTitle, excludeIds = [], currentSongStyle } = params;
  const excludeSet = new Set(excludeIds);
  const styleTrim = currentSongStyle?.trim() ?? '';

  const applyFilters = (rows: TidbitLibraryRow[]): TidbitLibraryRow[] => {
    let list = excludeSet.size > 0 ? rows.filter((r) => !excludeSet.has(r.id)) : rows;
    if (styleTrim) list = list.filter((r) => r.style === styleTrim);
    return list;
  };

  const artistNorm = artistName?.trim() ?? '';
  const songNorm = songTitle?.trim() ?? '';

  // アーティスト名で絞って取得（video_id は使わない。同一曲・同一アーティストは別 video でも再利用）
  let query = supabase
    .from('tidbit_library')
    .select('id, body, video_id, artist_name, song_title, keywords, room_id, style, created_at')
    .order('created_at', { ascending: false })
    .limit(300);

  if (artistNorm) {
    query = query.ilike('artist_name', artistNorm);
  } else if (videoId) {
    query = query.eq('video_id', videoId);
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === '42P01') return null;
    console.error('[tidbit-library] search', error);
    return null;
  }
  const rows = (data ?? []) as TidbitLibraryRow[];

  if (rows.length === 0) return null;

  // ① 同一曲（アーティスト＋曲名）で候補を出す
  if (artistNorm && songNorm) {
    const sameSong = rows.filter((r) => isSameSong(r.artist_name, r.song_title, artistNorm, songNorm));
    const candidates = applyFilters(sameSong);
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
  }

  // ② 同一アーティストの豆知識
  if (artistNorm) {
    const sameArtist = rows.filter((r) => isSameArtist(r.artist_name, artistNorm));
    const candidates = applyFilters(sameArtist);
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
  }

  // フォールバック: video_id で取ってきた場合や artist 未指定時
  const candidates = applyFilters(rows);
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return null;
}

export interface InsertTidbitParams {
  body: string;
  videoId?: string | null;
  artistName?: string | null;
  songTitle?: string | null;
  roomId?: string | null;
  style?: string | null;
}

/**
 * 豆知識を 1 件登録。本文が完全一致する既存があれば登録せず null を返す。
 */
export async function insertTidbitToLibrary(
  supabase: SupabaseClient | null,
  params: InsertTidbitParams
): Promise<TidbitLibraryRow | null> {
  if (!supabase) return null;

  const { body, videoId, artistName, songTitle, roomId, style } = params;
  const trimmed = body.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabase
    .from('tidbit_library')
    .select('id, body, video_id, artist_name, song_title, keywords, room_id, style, created_at')
    .eq('body', trimmed)
    .limit(1)
    .maybeSingle();

  if (existing) return existing as TidbitLibraryRow;

  const keywords = [artistName, songTitle].filter(Boolean).join(', ');
  const { data: inserted, error } = await supabase
    .from('tidbit_library')
    .insert({
      body: trimmed,
      video_id: videoId || null,
      artist_name: artistName || null,
      song_title: songTitle || null,
      keywords: keywords || null,
      room_id: roomId || null,
      style: style || null,
    })
    .select('id, body, video_id, artist_name, song_title, keywords, room_id, style, created_at')
    .single();

  if (error) {
    if (error.code === '42P01') return null;
    console.error('[tidbit-library] insert failed', error.code, error.message, error.details);
    return null;
  }
  return inserted as TidbitLibraryRow;
}
