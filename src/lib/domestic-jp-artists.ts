/**
 * 英字表記などで洋楽誤判定しやすい邦楽アーティスト名リスト（DB 管理）。
 * 管理: `/admin/domestic-jp-artists` · `domestic_jp_artists` テーブル。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export type DomesticJpArtistRow = {
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

const OFFICIAL_CHANNEL_SUFFIX_RE =
  /\s*(?:公式チャンネル|official\s+channel|official)\s*$/i;

let cachedKeys: Set<string> | null = null;
let cachedAt = 0;

/** 照合用: 小文字・空白・ピリオド除去（Mr.Children → mrchildren） */
export function normalizeDomesticJpArtistKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s.]+/g, '');
}

export function stripYoutubeOfficialChannelSuffix(
  name: string | null | undefined,
): string | null {
  if (!name?.trim()) return null;
  const stripped = name.trim().replace(OFFICIAL_CHANNEL_SUFFIX_RE, '').trim();
  return stripped.length >= 2 ? stripped : null;
}

export function looksLikeOfficialArtistChannel(
  channelTitle: string | null | undefined,
): boolean {
  return OFFICIAL_CHANNEL_SUFFIX_RE.test((channelTitle ?? '').trim());
}

export function domesticJpArtistMatchCandidates(
  ...names: (string | null | undefined)[]
): string[] {
  const out: string[] = [];
  for (const raw of names) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    out.push(raw);
    const stripped = stripYoutubeOfficialChannelSuffix(raw);
    if (stripped) out.push(stripped);
  }
  return out;
}

export function validateDomesticJpArtistNameInput(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (name.length < 1 || name.length > ARTIST_NAME_MAX) return null;
  const key = normalizeDomesticJpArtistKey(name);
  if (!key) return null;
  return name;
}

export function validateDomesticJpArtistNoteInput(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const note = raw.trim();
  if (note.length > NOTE_MAX) return null;
  return note || null;
}

/** テスト用 */
export function resetDomesticJpArtistCacheForTests(): void {
  cachedKeys = null;
  cachedAt = 0;
}

export function setDomesticJpArtistKeysForTests(keys: Iterable<string>): void {
  cachedKeys = new Set(keys);
  cachedAt = Date.now();
}

export function getDomesticJpArtistKeysCached(): Set<string> {
  return cachedKeys ?? new Set();
}

export function invalidateDomesticJpArtistCache(): void {
  cachedKeys = null;
  cachedAt = 0;
}

function legacyHardcodedDomesticKeys(): Set<string> {
  return new Set(['mrchildren']);
}

/** DB 未読込・テーブル未作成時の後方互換 */
function legacyDomesticMatch(...names: (string | null | undefined)[]): boolean {
  for (const candidate of domesticJpArtistMatchCandidates(...names)) {
    const key = normalizeDomesticJpArtistKey(candidate);
    if (key === 'mrchildren' || key.startsWith('mrchildren')) return true;
  }
  return false;
}

/**
 * アーティスト名が邦楽強制リストに一致するか（同期。事前に cache を温めておくこと）。
 */
export function matchesDomesticJpArtist(...names: (string | null | undefined)[]): boolean {
  const keys = cachedKeys;
  if (keys && keys.size > 0) {
    for (const candidate of domesticJpArtistMatchCandidates(...names)) {
      const key = normalizeDomesticJpArtistKey(candidate);
      if (key && keys.has(key)) return true;
    }
    return false;
  }
  return legacyDomesticMatch(...names);
}

export async function loadDomesticJpArtistKeys(admin: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await admin
    .from('domestic_jp_artists')
    .select('name_key')
    .order('artist_name', { ascending: true });

  if (error) {
    if (error.code === '42P01') {
      return legacyHardcodedDomesticKeys();
    }
    console.error('[domestic-jp-artists] load keys', error);
    return cachedKeys ?? legacyHardcodedDomesticKeys();
  }

  const out = new Set<string>();
  for (const row of data ?? []) {
    const key =
      typeof (row as { name_key?: string }).name_key === 'string'
        ? normalizeDomesticJpArtistKey((row as { name_key: string }).name_key)
        : '';
    if (key) out.add(key);
  }
  if (out.size === 0) {
    for (const k of legacyHardcodedDomesticKeys()) out.add(k);
  }
  return out;
}

export async function ensureDomesticJpArtistCache(
  admin?: SupabaseClient | null,
): Promise<Set<string>> {
  if (cachedKeys && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedKeys;
  }
  const client = admin ?? createAdminClient();
  if (!client) {
    cachedKeys = legacyHardcodedDomesticKeys();
    cachedAt = Date.now();
    return cachedKeys;
  }
  cachedKeys = await loadDomesticJpArtistKeys(client);
  cachedAt = Date.now();
  return cachedKeys;
}

export async function listDomesticJpArtists(
  admin: SupabaseClient,
): Promise<{ rows: DomesticJpArtistRow[]; tableMissing: boolean }> {
  const { data, error } = await admin
    .from('domestic_jp_artists')
    .select('id, artist_name, name_key, note, created_at, updated_at')
    .order('artist_name', { ascending: true });

  if (error) {
    if (error.code === '42P01') {
      return { rows: [], tableMissing: true };
    }
    throw error;
  }
  return { rows: (data ?? []) as DomesticJpArtistRow[], tableMissing: false };
}
