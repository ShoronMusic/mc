/**
 * 邦楽判定から除外し「洋楽扱い」にする日本人アーティスト名リスト（DB 管理）。
 * 管理: `/admin/western-treated-jp-artists` · `western_treated_jp_artists` テーブル。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export type WesternTreatedJpArtistRow = {
  id: string;
  artist_name: string;
  name_key: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

const ARTIST_NAME_MAX = 120;
const NOTE_MAX = 500;
const CACHE_TTL_MS = 60_000;

let cachedKeys: Set<string> | null = null;
let cachedAt = 0;

/** 照合用: 小文字・空白除去（ONE OK ROCK → oneokrock） */
export function normalizeWesternTreatedJpArtistKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

export function validateWesternTreatedJpArtistNameInput(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (name.length < 1 || name.length > ARTIST_NAME_MAX) return null;
  const key = normalizeWesternTreatedJpArtistKey(name);
  if (!key) return null;
  return name;
}

export function validateWesternTreatedJpArtistNoteInput(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const note = raw.trim();
  if (note.length > NOTE_MAX) return null;
  return note || null;
}

/** テスト用 */
export function resetWesternTreatedJpArtistCacheForTests(): void {
  cachedKeys = null;
  cachedAt = 0;
}

export function setWesternTreatedJpArtistKeysForTests(keys: Iterable<string>): void {
  cachedKeys = new Set(keys);
  cachedAt = Date.now();
}

export function getWesternTreatedJpArtistKeysCached(): Set<string> {
  return cachedKeys ?? new Set();
}

export function invalidateWesternTreatedJpArtistCache(): void {
  cachedKeys = null;
  cachedAt = 0;
}

function legacyHardcodedWesternTreatedKeys(): Set<string> {
  return new Set(['oneokrock']);
}

/** ワンオク表記ゆれ（DB 未読込・テーブル未作成時の後方互換） */
function legacyWesternTreatedMatch(...names: (string | null | undefined)[]): boolean {
  for (const raw of names) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const compact = raw.trim().toLowerCase().replace(/\s+/g, '');
    if (compact.includes('oneokrock')) return true;
    if (/ワンオク|ワンオクロック/.test(raw)) return true;
  }
  return false;
}

/**
 * アーティスト名が洋楽扱いリストに一致するか（同期。事前に cache を温めておくこと）。
 */
export function matchesWesternTreatedJpArtist(...names: (string | null | undefined)[]): boolean {
  const keys = cachedKeys;
  if (keys && keys.size > 0) {
    for (const raw of names) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const key = normalizeWesternTreatedJpArtistKey(raw);
      if (key && keys.has(key)) return true;
    }
    return false;
  }
  return legacyWesternTreatedMatch(...names);
}

/** ライブラリ用: slug のハイフンを除いて照合キーと比較（fujii-kaze → fujiikaze） */
export function normalizeWesternTreatedJpArtistSlugKey(slug: string): string {
  return slug.trim().toLowerCase().replace(/-/g, '').replace(/\s+/g, '');
}

export type WesternTreatedJpArtistLibrarySongRow = {
  main_artist?: string | null;
  song_title?: string | null;
  display_title?: string | null;
  primary_artist_name_ja?: string | null;
  music8_artist_slug?: string | null;
};

/**
 * 洋楽扱い日本人アーティストの曲は、洋楽・邦楽どちらのライブラリタブでもヒットさせる。
 * 邦楽登録で main_artist が日本語のときは `music8_artist_slug`（チャンネル英字）でも照合する。
 */
export function librarySongRowMatchesWesternTreatedJpArtist(
  row: WesternTreatedJpArtistLibrarySongRow,
): boolean {
  if (
    matchesWesternTreatedJpArtist(
      row.main_artist,
      row.primary_artist_name_ja,
      row.song_title,
      row.display_title,
    )
  ) {
    return true;
  }

  const slug = (row.music8_artist_slug ?? '').trim();
  if (!slug) return false;

  const keys = getWesternTreatedJpArtistKeysCached();
  if (keys.size === 0) return false;

  const slugKey = normalizeWesternTreatedJpArtistSlugKey(slug);
  return slugKey.length > 0 && keys.has(slugKey);
}

export async function loadWesternTreatedJpArtistKeys(
  admin: SupabaseClient,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from('western_treated_jp_artists')
    .select('name_key')
    .order('artist_name', { ascending: true });

  if (error) {
    if (error.code === '42P01') {
      return legacyHardcodedWesternTreatedKeys();
    }
    console.error('[western-treated-jp-artists] load keys', error);
    return cachedKeys ?? legacyHardcodedWesternTreatedKeys();
  }

  const out = new Set<string>();
  for (const row of data ?? []) {
    const key =
      typeof (row as { name_key?: string }).name_key === 'string'
        ? normalizeWesternTreatedJpArtistKey((row as { name_key: string }).name_key)
        : '';
    if (key) out.add(key);
  }
  if (out.size === 0) {
    for (const k of legacyHardcodedWesternTreatedKeys()) out.add(k);
  }
  return out;
}

export async function ensureWesternTreatedJpArtistCache(
  admin?: SupabaseClient | null,
): Promise<Set<string>> {
  if (cachedKeys && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedKeys;
  }
  const client = admin ?? createAdminClient();
  if (!client) {
    cachedKeys = legacyHardcodedWesternTreatedKeys();
    cachedAt = Date.now();
    return cachedKeys;
  }
  cachedKeys = await loadWesternTreatedJpArtistKeys(client);
  cachedAt = Date.now();
  return cachedKeys;
}

export async function listWesternTreatedJpArtists(
  admin: SupabaseClient,
): Promise<{ rows: WesternTreatedJpArtistRow[]; tableMissing: boolean }> {
  const { data, error } = await admin
    .from('western_treated_jp_artists')
    .select('id, artist_name, name_key, note, created_at, updated_at')
    .order('artist_name', { ascending: true });

  if (error) {
    if (error.code === '42P01') {
      return { rows: [], tableMissing: true };
    }
    throw error;
  }
  return { rows: (data ?? []) as WesternTreatedJpArtistRow[], tableMissing: false };
}
