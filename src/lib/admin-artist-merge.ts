/**
 * 管理用: artists 重複行の検出・マージ
 * 高信頼（空白差・同一 Spotify/m8 ID・name↔name_en）のみ自動対象。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { clearArtistLookupIndexCache } from '@/lib/song-credits-sync';
import { buildSongDisplayTitle } from '@/lib/music8-canonical-artist-name';
import { titleMatchKey } from '@/lib/spotify-track-match';

export type ArtistMergeRow = {
  id: string;
  name: string | null;
  name_ja?: string | null;
  name_en?: string | null;
  name_base?: string | null;
  the_prefix?: string | null;
  music8_artist_slug?: string | null;
  music8_artist_id?: number | null;
  music8_synced_at?: string | null;
  spotify_artist_id?: string | null;
  origin_country?: string | null;
  profile_text?: string | null;
  created_at?: string | null;
};

export type ArtistMergeConfidence = 'high' | 'medium' | 'blocked';

export type ArtistMergePair = {
  keep: ArtistMergeRow;
  lose: ArtistMergeRow;
  confidence: ArtistMergeConfidence;
  reasons: string[];
};

export type ArtistMergeResult = {
  keepId: string;
  loseId: string;
  dryRun: boolean;
  songsArtistIdUpdated: number;
  songCreditsMoved: number;
  songCreditsDeletedAsDup: number;
  mainArtistUpdated: number;
  loseDeleted: boolean;
  skippedReason?: string;
};

/** 空白・記号を除いた同一性キー（米津玄師 / 米津 玄師） */
export function artistIdentityKey(name: string | null | undefined): string {
  if (!name?.trim()) return '';
  return titleMatchKey(name);
}

function collectIdentityKeys(row: ArtistMergeRow): string[] {
  const keys = new Set<string>();
  for (const n of [row.name, row.name_ja, row.name_en, row.name_base]) {
    const k = artistIdentityKey(n);
    if (k.length >= 2) keys.add(k);
  }
  return [...keys];
}

export function scoreKeepArtist(row: ArtistMergeRow, refCounts: Map<string, number>): number {
  let score = 0;
  if (row.music8_artist_id != null) score += 1000;
  if (row.music8_synced_at) score += 200;
  if (row.spotify_artist_id?.trim()) score += 400;
  if (row.music8_artist_slug?.trim() && !row.music8_artist_slug.startsWith('jp-')) score += 150;
  if (row.profile_text?.trim()) score += 50;
  if (row.name_ja?.trim()) score += 30;
  if (row.name_en?.trim()) score += 20;
  score += (refCounts.get(row.id) ?? 0) * 10;
  const created = row.created_at ? Date.parse(row.created_at) : NaN;
  if (Number.isFinite(created)) score += Math.max(0, 1_700_000_000_000 - created) / 1e12;
  return score;
}

/**
 * 2行が同一アーティスト候補か。
 * blocked: 両方に異なる music8_artist_id
 * high: Spotify同一 / m8 ID同一 / 空白差のみ / name↔name_en 一致
 */
export function classifyArtistMergePair(
  a: ArtistMergeRow,
  b: ArtistMergeRow,
): { confidence: ArtistMergeConfidence; reasons: string[] } | null {
  if (a.id === b.id) return null;

  const aM8 = a.music8_artist_id ?? null;
  const bM8 = b.music8_artist_id ?? null;
  if (aM8 != null && bM8 != null && aM8 !== bM8) {
    return { confidence: 'blocked', reasons: ['双方の music8_artist_id が異なる'] };
  }

  const reasons: string[] = [];
  let high = false;

  const aSp = a.spotify_artist_id?.trim() ?? '';
  const bSp = b.spotify_artist_id?.trim() ?? '';
  if (aSp && bSp && aSp === bSp) {
    reasons.push('spotify_artist_id 同一');
    high = true;
  }

  if (aM8 != null && bM8 != null && aM8 === bM8) {
    reasons.push('music8_artist_id 同一');
    high = true;
  }

  const aSlug = a.music8_artist_slug?.trim().toLowerCase() ?? '';
  const bSlug = b.music8_artist_slug?.trim().toLowerCase() ?? '';
  if (aSlug && bSlug && aSlug === bSlug) {
    reasons.push('music8_artist_slug 同一');
    high = true;
  }

  const aKeys = collectIdentityKeys(a);
  const bKeys = collectIdentityKeys(b);
  const shared = aKeys.filter((k) => bKeys.includes(k));
  if (shared.length > 0) {
    reasons.push(`表記キー一致 (${shared[0]})`);
    high = true;
  }

  if (!high) return null;
  return { confidence: 'high', reasons };
}

export function pickKeepAndLose(
  a: ArtistMergeRow,
  b: ArtistMergeRow,
  refCounts: Map<string, number>,
): { keep: ArtistMergeRow; lose: ArtistMergeRow } {
  const sa = scoreKeepArtist(a, refCounts);
  const sb = scoreKeepArtist(b, refCounts);
  if (sa >= sb) return { keep: a, lose: b };
  return { keep: b, lose: a };
}

export function findHighConfidenceMergePairs(rows: ArtistMergeRow[]): ArtistMergePair[] {
  const refCounts = new Map<string, number>();
  const pairs: ArtistMergePair[] = [];
  const used = new Set<string>();

  // Index by identity key / spotify / m8 id / slug
  const byKey = new Map<string, ArtistMergeRow[]>();
  const add = (key: string, row: ArtistMergeRow) => {
    if (!key) return;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  };

  for (const row of rows) {
    for (const k of collectIdentityKeys(row)) add(`id:${k}`, row);
    if (row.spotify_artist_id?.trim()) add(`sp:${row.spotify_artist_id.trim()}`, row);
    if (row.music8_artist_id != null) add(`m8:${row.music8_artist_id}`, row);
    const slug = row.music8_artist_slug?.trim().toLowerCase();
    if (slug) add(`slug:${slug}`, row);
  }

  const considered = new Set<string>();
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const uniq = [...new Map(group.map((r) => [r.id, r])).values()];
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const a = uniq[i]!;
        const b = uniq[j]!;
        const pairKey = [a.id, b.id].sort().join(':');
        if (considered.has(pairKey)) continue;
        considered.add(pairKey);
        const classified = classifyArtistMergePair(a, b);
        if (!classified || classified.confidence !== 'high') continue;
        const { keep, lose } = pickKeepAndLose(a, b, refCounts);
        const edge = `${keep.id}>${lose.id}`;
        if (used.has(lose.id) || used.has(edge)) continue;
        used.add(lose.id);
        pairs.push({ keep, lose, confidence: 'high', reasons: classified.reasons });
      }
    }
  }

  return pairs;
}

async function countSongRefs(admin: SupabaseClient, artistId: string): Promise<number> {
  const { count } = await admin
    .from('songs')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId);
  return count ?? 0;
}

async function coalesceArtistFields(
  admin: SupabaseClient,
  keep: ArtistMergeRow,
  lose: ArtistMergeRow,
  dryRun: boolean,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  const fill = (key: keyof ArtistMergeRow) => {
    const k = keep[key];
    const l = lose[key];
    const kEmpty = k == null || (typeof k === 'string' && !k.trim());
    const lVal = typeof l === 'string' ? l.trim() : l;
    if (kEmpty && lVal != null && lVal !== '') patch[key as string] = l;
  };
  fill('name_ja');
  fill('name_en');
  fill('name_base');
  fill('the_prefix');
  fill('origin_country');
  fill('profile_text');
  fill('spotify_artist_id');
  if ((keep.music8_artist_id == null || keep.music8_artist_id === undefined) && lose.music8_artist_id != null) {
    patch.music8_artist_id = lose.music8_artist_id;
  }
  if (!keep.music8_artist_slug?.trim() && lose.music8_artist_slug?.trim()) {
    patch.music8_artist_slug = lose.music8_artist_slug;
  }
  if (!keep.music8_synced_at && lose.music8_synced_at) {
    patch.music8_synced_at = lose.music8_synced_at;
  }
  // 邦楽: keep が英字のみで lose が日本語なら name を日本語へ
  const keepName = (keep.name ?? '').trim();
  const loseName = (lose.name ?? '').trim();
  const keepHasJa = /[\u3040-\u30ff\u3400-\u9fff]/.test(keepName);
  const loseHasJa = /[\u3040-\u30ff\u3400-\u9fff]/.test(loseName);
  if (!keepHasJa && loseHasJa) {
    patch.name = loseName;
    if (!keep.name_en?.trim()) patch.name_en = keepName;
  } else if (keepHasJa && !keep.name_en?.trim() && loseName && !loseHasJa) {
    patch.name_en = loseName;
  }

  if (Object.keys(patch).length === 0 || dryRun) return;
  const { error } = await admin.from('artists').update(patch).eq('id', keep.id);
  if (error) throw new Error(`artists coalesce: ${error.message}`);
}

/**
 * lose → keep に参照を付け替え、lose を削除（可能なら）。
 */
export async function mergeArtistRows(
  admin: SupabaseClient,
  keep: ArtistMergeRow,
  lose: ArtistMergeRow,
  options: { dryRun?: boolean; updateMainArtist?: boolean } = {},
): Promise<ArtistMergeResult> {
  const dryRun = options.dryRun === true;
  const updateMainArtist = options.updateMainArtist !== false;
  const result: ArtistMergeResult = {
    keepId: keep.id,
    loseId: lose.id,
    dryRun,
    songsArtistIdUpdated: 0,
    songCreditsMoved: 0,
    songCreditsDeletedAsDup: 0,
    mainArtistUpdated: 0,
    loseDeleted: false,
  };

  if (keep.id === lose.id) {
    result.skippedReason = '同一 id';
    return result;
  }

  const classified = classifyArtistMergePair(keep, lose);
  if (!classified || classified.confidence === 'blocked') {
    result.skippedReason = classified?.reasons.join(', ') || 'マージ不可';
    return result;
  }

  await coalesceArtistFields(admin, keep, lose, dryRun);

  // song_credits: 衝突削除 → 付け替え
  const { data: loseCredits, error: cErr } = await admin
    .from('song_credits')
    .select('song_id, artist_id')
    .eq('artist_id', lose.id);
  if (cErr && cErr.code !== '42P01') throw new Error(`song_credits select: ${cErr.message}`);

  for (const row of loseCredits ?? []) {
    const songId = (row as { song_id: string }).song_id;
    const { data: existing } = await admin
      .from('song_credits')
      .select('song_id')
      .eq('song_id', songId)
      .eq('artist_id', keep.id)
      .maybeSingle();
    if (existing) {
      result.songCreditsDeletedAsDup += 1;
      if (!dryRun) {
        const { error } = await admin
          .from('song_credits')
          .delete()
          .eq('song_id', songId)
          .eq('artist_id', lose.id);
        if (error) throw new Error(`song_credits delete dup: ${error.message}`);
      }
    } else {
      result.songCreditsMoved += 1;
      if (!dryRun) {
        const { error } = await admin
          .from('song_credits')
          .update({ artist_id: keep.id })
          .eq('song_id', songId)
          .eq('artist_id', lose.id);
        if (error) throw new Error(`song_credits update: ${error.message}`);
      }
    }
  }

  const { data: songsWithLose, error: sErr } = await admin
    .from('songs')
    .select('id')
    .eq('artist_id', lose.id);
  if (sErr) throw new Error(`songs by artist_id: ${sErr.message}`);
  result.songsArtistIdUpdated = songsWithLose?.length ?? 0;
  if (!dryRun && result.songsArtistIdUpdated > 0) {
    const { error } = await admin
      .from('songs')
      .update({ artist_id: keep.id })
      .eq('artist_id', lose.id);
    if (error) throw new Error(`songs.artist_id update: ${error.message}`);
  }

  if (updateMainArtist) {
    const loseNames = [lose.name, lose.name_ja, lose.name_en]
      .map((n) => (typeof n === 'string' ? n.trim() : ''))
      .filter(Boolean);
    const canonical = (
      (await admin.from('artists').select('name').eq('id', keep.id).maybeSingle()).data as
        | { name?: string }
        | null
    )?.name?.trim() || keep.name?.trim() || '';

    if (canonical && loseNames.length > 0) {
      for (const loseName of loseNames) {
        const { data: songRows, error: mErr } = await admin
          .from('songs')
          .select('id, song_title, display_title, main_artist')
          .eq('main_artist', loseName);
        if (mErr) throw new Error(`songs main_artist: ${mErr.message}`);
        for (const song of songRows ?? []) {
          result.mainArtistUpdated += 1;
          if (dryRun) continue;
          const songTitle = ((song as { song_title?: string }).song_title ?? '').trim();
          const payload: Record<string, string> = { main_artist: canonical };
          if (songTitle) payload.display_title = buildSongDisplayTitle(canonical, songTitle);
          const { error } = await admin
            .from('songs')
            .update(payload)
            .eq('id', (song as { id: string }).id);
          if (error) throw new Error(`songs main_artist update: ${error.message}`);
        }
      }
    }
  }

  // lose のユニーク列を空にしてから削除
  if (!dryRun) {
    await admin
      .from('artists')
      .update({
        music8_artist_id: null,
        music8_artist_slug: null,
        spotify_artist_id: null,
      })
      .eq('id', lose.id);

    const refs = await countSongRefs(admin, lose.id);
    if (refs === 0) {
      const { error: dErr } = await admin.from('artists').delete().eq('id', lose.id);
      if (dErr) throw new Error(`artists delete: ${dErr.message}`);
      result.loseDeleted = true;
    } else {
      result.skippedReason = `lose に songs.artist_id が ${refs} 件残存`;
    }
    clearArtistLookupIndexCache();
  } else {
    result.loseDeleted = true;
  }

  return result;
}

export async function loadArtistsForMergeScan(
  admin: SupabaseClient,
  options: { sinceIso?: string; limit?: number } = {},
): Promise<ArtistMergeRow[]> {
  const limit = options.limit ?? 5000;
  const rows: ArtistMergeRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; offset < limit; offset += PAGE) {
    let q = admin
      .from('artists')
      .select(
        'id, name, name_ja, name_en, name_base, the_prefix, music8_artist_slug, music8_artist_id, music8_synced_at, spotify_artist_id, origin_country, profile_text, created_at',
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (options.sinceIso) q = q.gte('created_at', options.sinceIso);
    const { data, error } = await q;
    if (error) {
      // name_en が無い環境向けフォールバック
      if (error.code === '42703') {
        const { data: d2, error: e2 } = await admin
          .from('artists')
          .select(
            'id, name, name_ja, name_base, the_prefix, music8_artist_slug, music8_artist_id, music8_synced_at, spotify_artist_id, origin_country, profile_text, created_at',
          )
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (e2) throw e2;
        rows.push(...((d2 as ArtistMergeRow[]) ?? []));
        if ((d2?.length ?? 0) < PAGE) break;
        continue;
      }
      throw error;
    }
    rows.push(...((data as ArtistMergeRow[]) ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return rows;
}

export async function autoMergeHighConfidenceArtists(
  admin: SupabaseClient,
  options: { dryRun?: boolean; sinceDays?: number; updateMainArtist?: boolean } = {},
): Promise<{
  pairsFound: number;
  merged: ArtistMergeResult[];
  pairs: ArtistMergePair[];
}> {
  const sinceDays = options.sinceDays ?? 90;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - sinceDays);
  // 候補検出のため最近の行＋全体索引用に広めに読む
  const recent = await loadArtistsForMergeScan(admin, { sinceIso: since.toISOString(), limit: 3000 });
  const allForMatch = await loadArtistsForMergeScan(admin, { limit: 8000 });
  const byId = new Map(allForMatch.map((r) => [r.id, r]));
  for (const r of recent) byId.set(r.id, r);
  const pool = [...byId.values()];
  const pairs = findHighConfidenceMergePairs(pool).filter((p) =>
    recent.some((r) => r.id === p.keep.id || r.id === p.lose.id),
  );

  const merged: ArtistMergeResult[] = [];
  for (const pair of pairs) {
    const result = await mergeArtistRows(admin, pair.keep, pair.lose, {
      dryRun: options.dryRun === true,
      updateMainArtist: options.updateMainArtist !== false,
    });
    merged.push(result);
  }
  return { pairsFound: pairs.length, merged, pairs };
}
