/**
 * Music8 アーティスト JSON → mc `artists` 行へのマッピング・突合。
 * 計画: docs/music8-artist-import-and-integration-plan.md
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { stripLeadingArticleForSort } from '@/lib/admin-library-index';
import {
  formatArtistDisplayName,
  formatMusic8ArtistDisplayLines,
  getJapaneseDescription,
  type Music8ArtistJson,
} from '@/lib/music8-artist-display';
import { syncArtistMembersForArtist } from '@/lib/artist-members';

export type Music8ArtistDbPatch = Record<string, unknown>;

function asObj(x: unknown): Record<string, unknown> | null {
  if (x && typeof x === 'object' && !Array.isArray(x)) return x as Record<string, unknown>;
  return null;
}

/** WP REST / GCS JSON を `Music8ArtistJson` に正規化（acf をトップにマージ） */
export function normalizeMusic8ArtistSource(raw: unknown): Music8ArtistJson | null {
  const obj = asObj(raw);
  if (!obj) return null;
  const acf = asObj(obj.acf);
  const merged = acf ? { ...obj, ...acf } : { ...obj };
  if (typeof merged.name !== 'string' || !merged.name.trim()) return null;
  return merged as Music8ArtistJson;
}

/** m8 の thePrefix / the_prefix（"1" は The 扱いのレガシー） */
export function parseMusic8ThePrefix(artist: Music8ArtistJson): string | null {
  const raw = artist as Record<string, unknown>;
  const tp = artist.thePrefix ?? raw.the_prefix ?? raw.thePrefix;
  if (typeof tp === 'string' && tp.trim()) {
    const t = tp.trim();
    if (t === '1') return 'The';
    if (/^(the|a|an)$/i.test(t)) return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    return t;
  }
  return null;
}

export function buildNameSort(displayName: string): string {
  return stripLeadingArticleForSort(displayName).toLowerCase();
}

/** m8 `public/data/artists.json` 一覧の1行（コンパクト） */
export type Music8ArtistListEntry = {
  slug: string;
  music8ArtistId: number | null;
  name: string | null;
};

/**
 * アーティスト一覧 JSON（配列）から slug リストを抽出。
 * 実体: `E:\m8\public\data\artists.json` / mc 参照 `log/artists.json`
 */
export function parseArtistsListJson(raw: unknown): Music8ArtistListEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: Music8ArtistListEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const slug = typeof o.slug === 'string' ? o.slug.trim().toLowerCase() : '';
    if (!slug || slug.includes('_')) continue;
    const idRaw = o.id;
    let music8ArtistId: number | null = null;
    if (typeof idRaw === 'number' && Number.isFinite(idRaw)) {
      music8ArtistId = Math.round(idRaw);
    } else if (typeof idRaw === 'string' && /^\d+$/.test(idRaw.trim())) {
      music8ArtistId = parseInt(idRaw.trim(), 10);
    }
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : null;
    out.push({ slug, music8ArtistId, name });
  }
  return out;
}

export function loadArtistsListFromFile(filePath: string): Music8ArtistListEntry[] {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8')) as unknown;
  return parseArtistsListJson(raw);
}

/** m8 個別アーティスト JSON: `abc.json` のみ。`abc_songs.json` 等は対象外 */
export function isArtistMasterJsonFileName(fileName: string): boolean {
  const base = path.basename(fileName);
  if (!/^[a-z0-9-]+\.json$/i.test(base)) return false;
  const slug = base.slice(0, -'.json'.length);
  return !slug.includes('_');
}

export function slugFromArtistMasterJsonFileName(fileName: string): string | null {
  if (!isArtistMasterJsonFileName(fileName)) return null;
  return path.basename(fileName).slice(0, -'.json'.length).toLowerCase();
}

export type BuildArtistPatchOptions = {
  /** 管理画面で上書きしたい表示名（未指定時は m8 から合成） */
  displayNameOverride?: string | null;
};

/**
 * m8 JSON から `artists` upsert 用パッチを生成。
 * `name` は表示名（The Strokes）、`name_base` / `the_prefix` は m8 準拠。
 */
export function buildArtistPatchFromMusic8Json(
  src: Music8ArtistJson,
  opts?: BuildArtistPatchOptions,
): Music8ArtistDbPatch {
  const fmt = formatMusic8ArtistDisplayLines(src);
  const nameBase = (src.name ?? '').trim();
  const thePrefix = parseMusic8ThePrefix(src);
  const displayName =
    (opts?.displayNameOverride ?? '').trim() ||
    formatArtistDisplayName(nameBase, thePrefix) ||
    fmt.nameDisplay ||
    nameBase;

  const slug = typeof src.slug === 'string' && src.slug.trim() ? src.slug.trim().toLowerCase() : null;
  const m8IdRaw = (src as Record<string, unknown>).id;
  const music8ArtistId =
    typeof m8IdRaw === 'number' && Number.isFinite(m8IdRaw)
      ? Math.round(m8IdRaw)
      : typeof m8IdRaw === 'string' && /^\d+$/.test(m8IdRaw.trim())
        ? parseInt(m8IdRaw.trim(), 10)
        : null;

  const nameJa =
    typeof src.artistjpname === 'string' && src.artistjpname.trim()
      ? src.artistjpname.trim()
      : null;

  const raw = src as Record<string, unknown>;
  const acf = asObj(raw.acf);
  const spotifyId =
    (typeof raw.spotify_artist_id === 'string' && raw.spotify_artist_id.trim()) ||
    (acf && typeof acf.spotify_artist_id === 'string' && acf.spotify_artist_id.trim()) ||
    null;
  const spotifyImages =
    (typeof raw.spotify_artist_images === 'string' && raw.spotify_artist_images.trim()) ||
    (typeof raw.spotifyArtistImages === 'string' && raw.spotifyArtistImages.trim()) ||
    (acf && typeof acf.spotify_artist_images === 'string' && acf.spotify_artist_images.trim()) ||
    null;

  const descriptionEn = (src.description ?? '').trim() || null;
  const descriptionJa = getJapaneseDescription(src.description) || null;
  const profileText = descriptionJa || null;

  const activeYearStart = (src.artistactiveyearstart ??
    raw.artistActiveYearStart ??
    '') as string;
  const activeYearStartTrim =
    typeof activeYearStart === 'string' ? activeYearStart.trim() : '';

  const memberRaw = src.member ?? raw.Member;
  let music8Members: unknown = null;
  if (memberRaw !== false && memberRaw != null) {
    music8Members = memberRaw;
  }

  const patch: Music8ArtistDbPatch = {
    name: displayName,
    name_base: nameBase || null,
    the_prefix: thePrefix,
    name_sort: buildNameSort(displayName),
    music8_artist_slug: slug,
    music8_artist_id: music8ArtistId,
    name_ja: nameJa,
    kind: fmt.occupationDisplay?.trim() || null,
    origin_country: fmt.origin?.trim() || null,
    active_year_start: activeYearStartTrim || null,
    active_period: fmt.activeYears?.trim() || null,
    members: fmt.memberDisplay?.trim() || null,
    youtube_channel_title: fmt.youtubeChannelHref
      ? `${fmt.nameDisplay || displayName} YouTube Channel`
      : null,
    youtube_channel_url: fmt.youtubeChannelHref?.trim() || null,
    image_url: fmt.imageUrl?.trim() || null,
    profile_text: profileText,
    description_en: descriptionEn,
    spotify_artist_id: spotifyId,
    spotify_artist_images: spotifyImages,
    music8_members: music8Members,
    music8_synced_at: new Date().toISOString(),
  };

  return patch;
}

export function normalizeArtistNameLoose(name: string): string {
  return stripLeadingArticleForSort(name).toLowerCase();
}

function isMissingColumnError(code: string | undefined): boolean {
  return code === '42703' || code === '42P01';
}

/** `idx_artists_name`（`lower(name)`）と同系の比較キー */
export function lowerNameKeyForArtistUnique(name: string): string {
  return name.trim().toLowerCase();
}

function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** 突合候補の表示名バリエーション（The 付与／本体名など） */
export function buildArtistNameMatchVariants(patch: Music8ArtistDbPatch): string[] {
  const display = String(patch.name ?? '').trim();
  const base = String(patch.name_base ?? '').trim();
  const prefix = (patch.the_prefix as string | null) ?? null;
  const out = new Set<string>();
  if (display) out.add(display);
  if (base) {
    out.add(base);
    const withPrefix = formatArtistDisplayName(base, prefix);
    if (withPrefix) out.add(withPrefix);
  }
  return [...out];
}

type ArtistCandidateRow = {
  id: string;
  name: string | null;
  music8_artist_slug: string | null;
  music8_artist_id: number | null;
};

function pickIdFromNameRows(
  rows: { id?: string; name?: string | null }[] | null,
  displayName: string,
  looseKey: string,
): string | null {
  if (!rows?.length) return null;
  const lowerKey = lowerNameKeyForArtistUnique(displayName);
  for (const row of rows) {
    const id = row.id;
    const n = String(row.name ?? '').trim();
    if (!id || !n) continue;
    if (lowerNameKeyForArtistUnique(n) === lowerKey) return id;
    if (normalizeArtistNameLoose(n) === looseKey) return id;
  }
  return null;
}

function artistRowMatchesMusic8Patch(
  row: ArtistCandidateRow,
  patch: Music8ArtistDbPatch,
): boolean {
  const slug = (patch.music8_artist_slug as string | null) ?? null;
  const displayName = String(patch.name ?? '').trim();
  const lowerKey = displayName ? lowerNameKeyForArtistUnique(displayName) : '';
  if (slug && row.music8_artist_slug === slug) return true;
  if (lowerKey && lowerNameKeyForArtistUnique(row.name ?? '') === lowerKey) return true;
  return false;
}

/** 別アーティスト行に誤って載った `music8_artist_id` を外す（unique 衝突の解除） */
async function releaseMisassignedMusic8ArtistId(
  admin: SupabaseClient,
  m8Id: number,
  patch: Music8ArtistDbPatch,
  exceptId?: string | null,
): Promise<void> {
  const { data, error } = await admin
    .from('artists')
    .select('id, name, music8_artist_slug, music8_artist_id')
    .eq('music8_artist_id', m8Id)
    .limit(10);
  if (error?.code === '42P01') return;
  if (error) throw new Error(error.message);
  for (const raw of data ?? []) {
    const row = raw as ArtistCandidateRow;
    if (!row.id || row.id === exceptId) continue;
    if (artistRowMatchesMusic8Patch(row, patch)) continue;
    const { error: updErr } = await admin
      .from('artists')
      .update({ music8_artist_id: null })
      .eq('id', row.id);
    if (updErr) throw new Error(updErr.message);
  }
}

/** 複数候補から m8 取り込み先の1行を選ぶ（同名重複行対策） */
export function pickCanonicalArtistRow(
  rows: ArtistCandidateRow[],
  patch: Music8ArtistDbPatch,
): ArtistCandidateRow | null {
  if (!rows.length) return null;
  const slug = (patch.music8_artist_slug as string | null) ?? null;
  const m8Id = patch.music8_artist_id as number | null;
  const displayName = String(patch.name ?? '').trim();
  const lowerKey = displayName ? lowerNameKeyForArtistUnique(displayName) : '';

  const score = (r: ArtistCandidateRow): number => {
    let s = 0;
    if (slug && r.music8_artist_slug === slug) s += 100;
    if (m8Id != null && r.music8_artist_id === m8Id) {
      const slugMatch = Boolean(slug && r.music8_artist_slug === slug);
      const nameMatch =
        Boolean(lowerKey && lowerNameKeyForArtistUnique(r.name ?? '') === lowerKey);
      if (slugMatch && nameMatch) s += 200;
      else if (slugMatch || nameMatch) s += 150;
      else s += 15;
    }
    if (lowerKey && lowerNameKeyForArtistUnique(r.name ?? '') === lowerKey) s += 60;
    if (r.music8_artist_slug) s += 10;
    if (r.music8_artist_id != null) s += 5;
    return s;
  };

  return [...rows].sort((a, b) => score(b) - score(a))[0] ?? null;
}

async function fetchArtistCandidatesByIds(
  admin: SupabaseClient,
  ids: string[],
): Promise<ArtistCandidateRow[]> {
  if (!ids.length) return [];
  const { data, error } = await admin
    .from('artists')
    .select('id, name, music8_artist_slug, music8_artist_id')
    .in('id', ids);
  if (error?.code === '42P01') return [];
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r) => {
      const row = r as {
        id?: string;
        name?: string | null;
        music8_artist_slug?: string | null;
        music8_artist_id?: number | null;
      };
      return row.id
        ? {
            id: row.id,
            name: row.name ?? null,
            music8_artist_slug: row.music8_artist_slug ?? null,
            music8_artist_id: row.music8_artist_id ?? null,
          }
        : null;
    })
    .filter((r): r is ArtistCandidateRow => r != null);
}

/**
 * パッチに紐づく既存行をすべて収集（同名の重複行も含む）。
 */
export async function findArtistRowsByMusic8Patch(
  admin: SupabaseClient,
  patch: Music8ArtistDbPatch,
): Promise<ArtistCandidateRow[]> {
  const slug = (patch.music8_artist_slug as string | null) ?? null;
  const m8Id = patch.music8_artist_id as number | null;
  const displayName = String(patch.name ?? '').trim();
  const looseKey =
    (typeof patch.name_sort === 'string' && patch.name_sort.trim()) ||
    (displayName ? normalizeArtistNameLoose(displayName) : '');

  const idSet = new Set<string>();

  const addIds = (rows: { id?: string }[] | null) => {
    for (const r of rows ?? []) {
      if (r?.id) idSet.add(r.id);
    }
  };

  if (m8Id != null) {
    const { data, error } = await admin
      .from('artists')
      .select('id')
      .eq('music8_artist_id', m8Id)
      .limit(5);
    if (error && !isMissingColumnError(error.code)) throw new Error(error.message);
    addIds(data);
  }

  if (slug) {
    const { data, error } = await admin
      .from('artists')
      .select('id')
      .eq('music8_artist_slug', slug)
      .limit(5);
    if (error && error.code !== '42P01') throw new Error(error.message);
    addIds(data);
  }

  if (looseKey) {
    const { data, error } = await admin
      .from('artists')
      .select('id, name')
      .eq('name_sort', looseKey)
      .limit(20);
    if (error && !isMissingColumnError(error.code)) throw new Error(error.message);
    addIds(data);
    const hit = pickIdFromNameRows(
      (data ?? []) as { id?: string; name?: string | null }[],
      displayName,
      looseKey,
    );
    if (hit) idSet.add(hit);
  }

  if (displayName) {
    for (const variant of buildArtistNameMatchVariants(patch)) {
      const { data, error } = await admin
        .from('artists')
        .select('id, name')
        .ilike('name', escapeIlikeExact(variant))
        .limit(50);
      if (error && error.code !== '42P01') throw new Error(error.message);
      addIds(data);
      const hit = pickIdFromNameRows(
        (data ?? []) as { id?: string; name?: string | null }[],
        displayName,
        looseKey,
      );
      if (hit) idSet.add(hit);
    }
  }

  return fetchArtistCandidatesByIds(admin, [...idSet]);
}

/**
 * 既存 `artists` 行を解決（重複行があれば slug / m8 id 優先で1行に寄せる）。
 */
export async function resolveExistingArtistIdForMusic8Patch(
  admin: SupabaseClient,
  patch: Music8ArtistDbPatch,
): Promise<string | null> {
  const rows = await findArtistRowsByMusic8Patch(admin, patch);
  return pickCanonicalArtistRow(rows, patch)?.id ?? null;
}

type UpdateArtistResult = { ok: true } | { ok: false; error: string; code?: string };

async function updateArtistRowWithPatch(
  admin: SupabaseClient,
  targetId: string,
  payload: Music8ArtistDbPatch,
): Promise<UpdateArtistResult> {
  const { error } = await admin.from('artists').update(payload).eq('id', targetId);
  if (!error) return { ok: true };

  const msg = error.message ?? '';
  if (isDuplicateArtistNameError(error.code, msg) && 'name' in payload) {
    const { name: _n, ...rest } = payload;
    if (Object.keys(rest).length === 0) return { ok: false, error: msg, code: error.code };
    const { error: e2 } = await admin.from('artists').update(rest).eq('id', targetId);
    if (!e2) return { ok: true };
    return { ok: false, error: e2.message, code: e2.code };
  }

  if (isDuplicateMusic8ArtistSlugError(error.code, msg) && 'music8_artist_slug' in payload) {
    const { music8_artist_slug: _s, ...rest } = payload;
    if (Object.keys(rest).length === 0) return { ok: false, error: msg, code: error.code };
    const { error: e2 } = await admin.from('artists').update(rest).eq('id', targetId);
    if (!e2) return { ok: true };
    return { ok: false, error: e2.message, code: e2.code };
  }

  return { ok: false, error: msg, code: error.code };
}

function isDuplicateArtistNameError(code: string | undefined, message: string): boolean {
  return code === '23505' && message.includes('idx_artists_name');
}

function isDuplicateMusic8ArtistIdError(code: string | undefined, message: string): boolean {
  return code === '23505' && message.includes('idx_artists_music8_artist_id');
}

function isDuplicateMusic8ArtistSlugError(code: string | undefined, message: string): boolean {
  return code === '23505' && message.includes('idx_artists_music8_artist_slug');
}

export type UpsertArtistFromMusic8Result = {
  artistId: string | null;
  mode: 'insert' | 'update' | 'dry-run' | 'skipped';
  patch: Music8ArtistDbPatch;
};

/** 存在しない列を除いてパッチを送る（マイグレーション前 DB でも動く） */
async function insertOrUpdateArtist(
  admin: SupabaseClient,
  patch: Music8ArtistDbPatch,
  existingId: string | null,
  dryRun: boolean,
): Promise<{ id: string | null; mode: 'insert' | 'update'; error?: string }> {
  if (dryRun) {
    return { id: existingId, mode: existingId ? 'update' : 'insert' };
  }

  let targetId = existingId;
  const tryPayload = { ...patch };

  for (let attempt = 0; attempt < 12; attempt++) {
    if (!targetId) {
      try {
        const rows = await findArtistRowsByMusic8Patch(admin, patch);
        targetId = pickCanonicalArtistRow(rows, patch)?.id ?? null;
      } catch (e) {
        return {
          id: null,
          mode: 'insert',
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    if (targetId) {
      const upd = await updateArtistRowWithPatch(admin, targetId, tryPayload);
      if (upd.ok) return { id: targetId, mode: 'update' };

      if (
        !upd.ok &&
        (isDuplicateArtistNameError(upd.code, upd.error) ||
          isDuplicateMusic8ArtistIdError(upd.code, upd.error) ||
          isDuplicateMusic8ArtistSlugError(upd.code, upd.error))
      ) {
        try {
          const rows = await findArtistRowsByMusic8Patch(admin, patch);
          const canon = pickCanonicalArtistRow(rows, patch);
          if (canon?.id && canon.id !== targetId) {
            targetId = canon.id;
            continue;
          }
          const m8Id = patch.music8_artist_id as number | null;
          if (m8Id != null && isDuplicateMusic8ArtistIdError(upd.code, upd.error)) {
            await releaseMisassignedMusic8ArtistId(admin, m8Id, patch, targetId);
            continue;
          }
        } catch {
          // updateArtistRowWithPatch は name 除外で再試行済み
        }
      }

      if (!upd.ok) {
        if (isMissingColumnError(upd.code)) {
          const m = upd.error.match(/column ['"]?([\w]+)['"]? /i);
          if (m?.[1] && m[1] in tryPayload) {
            delete tryPayload[m[1]];
            continue;
          }
        }
        return { id: null, mode: 'update', error: upd.error };
      }
    }

    const { data, error } = await admin.from('artists').insert(tryPayload).select('id').single();
    if (!error) {
      return { id: (data as { id?: string } | null)?.id ?? null, mode: 'insert' };
    }

    const msg = error.message ?? '';
    if (isDuplicateArtistNameError(error.code, msg)) {
      try {
        const rows = await findArtistRowsByMusic8Patch(admin, patch);
        const canon = pickCanonicalArtistRow(rows, patch);
        if (canon?.id) {
          targetId = canon.id;
          continue;
        }
      } catch (e) {
        return { id: null, mode: 'insert', error: e instanceof Error ? e.message : String(e) };
      }
      return { id: null, mode: 'insert', error: msg };
    }

    if (!isMissingColumnError(error.code)) {
      return { id: null, mode: 'insert', error: msg };
    }
    const m = msg.match(/column ['"]?([\w]+)['"]? /i);
    if (m?.[1] && m[1] in tryPayload) {
      delete tryPayload[m[1]];
      continue;
    }
    return { id: null, mode: 'insert', error: msg };
  }
  return { id: null, mode: 'insert', error: 'too many column retries' };
}

/** 管理画面・スクリプトから `artists` 行を patch upsert（列不足時は該当キーを落として再試行） */
export async function upsertArtistDbPatch(
  admin: SupabaseClient,
  patch: Music8ArtistDbPatch,
  existingId: string | null,
  dryRun = false,
): Promise<{ id: string | null; mode: 'insert' | 'update'; error?: string }> {
  return insertOrUpdateArtist(admin, patch, existingId, dryRun);
}

/**
 * m8 JSON 1件を `artists` に upsert。
 * 突合: music8_artist_id → music8_artist_slug → 名前（緩い一致）
 */
export async function upsertArtistFromMusic8Json(params: {
  admin: SupabaseClient;
  rawJson: unknown;
  dryRun?: boolean;
  displayNameOverride?: string | null;
}): Promise<UpsertArtistFromMusic8Result | { error: string }> {
  const src = normalizeMusic8ArtistSource(params.rawJson);
  if (!src) return { error: 'Music8 アーティスト JSON として解釈できません。' };

  const patch = buildArtistPatchFromMusic8Json(src, {
    displayNameOverride: params.displayNameOverride,
  });
  const dryRun = params.dryRun === true;
  let existingId: string | null = null;
  try {
    existingId = await resolveExistingArtistIdForMusic8Patch(params.admin, patch);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  const result = await insertOrUpdateArtist(params.admin, patch, existingId, dryRun);
  if (result.error) return { error: result.error };

  if (!dryRun && result.id) {
    try {
      await syncArtistMembersForArtist(params.admin, result.id, patch.music8_members);
    } catch (e) {
      console.warn(
        '[music8-artist-import] artist_members',
        e instanceof Error ? e.message : e,
      );
    }
  }

  return {
    artistId: result.id,
    mode: dryRun ? 'dry-run' : result.mode,
    patch,
  };
}

/** DB 行から正式表示名（m8 列があれば合成） */
export function displayNameFromArtistRow(row: {
  name?: string | null;
  name_base?: string | null;
  the_prefix?: string | null;
}): string | null {
  const base = (row.name_base ?? '').trim();
  const prefix = (row.the_prefix ?? '').trim() || null;
  if (base) {
    return formatArtistDisplayName(base, prefix) || base;
  }
  const n = (row.name ?? '').trim();
  return n || null;
}
