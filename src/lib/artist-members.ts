/**
 * バンド ↔ メンバー（artist_members）。Music8 member / music8_members から解決する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ArtistMemberLink = {
  id: string;
  name: string;
  name_ja: string | null;
  music8_artist_slug: string | null;
  kind?: string | null;
};

export type AdminMemberHintStatus = {
  name: string;
  slug: string;
  matched: ArtistMemberLink | null;
  alreadyLinked: boolean;
  roleGuess: 'band' | 'member' | 'unknown';
};

export type ArtistMemberGraphIds = {
  memberIds: string[];
  bandIds: string[];
  overlap: string[];
};

export type Music8MemberHint = { slug: string; name: string };

function asObj(x: unknown): Record<string, unknown> | null {
  if (x && typeof x === 'object' && !Array.isArray(x)) return x as Record<string, unknown>;
  return null;
}

/** WP の kind。band の member はメンバー、個人の member は所属バンド、を同じ配列に入れている。 */
export function isBandLikeKind(kind: string | null | undefined): boolean {
  const k = (kind ?? '').toLowerCase();
  return /\b(band|group|duo|trio|orchestra|choir|ensemble|quartet|quintet)\b/.test(k);
}

export function isPersonLikeKind(kind: string | null | undefined): boolean {
  const k = (kind ?? '').toLowerCase();
  if (isBandLikeKind(kind)) return false;
  return /\b(singer|songwriter|musician|guitarist|guitaristr|drummer|bassist|vocalist|composer|rapper|pianist|producer|dj)\b/.test(
    k,
  );
}

/**
 * 個人ページでは「メンバー」行を出さない（所属バンドと artists.members フォールバックが重複するため）。
 * バンドは member リンク、無ければ members 文字列。
 */
export function shouldShowArtistMembersLine(opts: {
  kind: string | null | undefined;
  memberLinkCount: number;
  bandLinkCount: number;
  hasMembersFallback: boolean;
}): boolean {
  if (isPersonLikeKind(opts.kind)) return false;
  if (opts.memberLinkCount > 0) return true;
  if (opts.bandLinkCount > 0) return false;
  return isBandLikeKind(opts.kind) && opts.hasMembersFallback;
}

/**
 * artist_members は常に artist_id=バンド, member_artist_id=メンバー。
 * 個人 JSON がバンドを member に載せているときは向きを直す。
 * kind が取れない行はリンクしない（WP の誤った member タクソノミーを拾わない）。
 */
export function directedMemberPair(
  source: { id: string; kind: string | null },
  target: { id: string; kind: string | null },
): { artist_id: string; member_artist_id: string } | null {
  if (!source.id || !target.id || source.id === target.id) return null;
  const srcBand = isBandLikeKind(source.kind);
  const srcPerson = isPersonLikeKind(source.kind);
  const tgtBand = isBandLikeKind(target.kind);
  const tgtPerson = isPersonLikeKind(target.kind);
  if (srcPerson && tgtBand) return { artist_id: target.id, member_artist_id: source.id };
  if (srcBand && tgtPerson) return { artist_id: source.id, member_artist_id: target.id };
  if (srcBand && !tgtBand) return { artist_id: source.id, member_artist_id: target.id };
  if (tgtBand && !srcBand && !srcPerson) return null;
  return null;
}

/** 管理画面のヒント行を「所属バンド」か「メンバー」のどちらに足すか。 */
export function guessHintLinkRole(
  sourceKind: string | null | undefined,
  targetKind: string | null | undefined,
): 'band' | 'member' | 'unknown' {
  const pair = directedMemberPair(
    { id: 'src', kind: sourceKind ?? null },
    { id: 'tgt', kind: targetKind ?? null },
  );
  if (pair?.artist_id === 'src' && pair.member_artist_id === 'tgt') return 'member';
  if (pair?.artist_id === 'tgt' && pair.member_artist_id === 'src') return 'band';
  if (isBandLikeKind(sourceKind) && !isBandLikeKind(targetKind)) return 'member';
  if (isPersonLikeKind(sourceKind) && !isPersonLikeKind(targetKind)) return 'band';
  return 'unknown';
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uniqueArtistIds(ids: string[], selfId?: string | null): string[] {
  const skip = (selfId ?? '').trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || !UUID_RE.test(id) || id === skip || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function splitMemberGraphIds(opts: {
  selfId?: string | null;
  memberIds: string[];
  bandIds: string[];
}): ArtistMemberGraphIds {
  const memberIds = uniqueArtistIds(opts.memberIds, opts.selfId);
  const bandIds = uniqueArtistIds(opts.bandIds, opts.selfId);
  const bandSet = new Set(bandIds);
  const overlap = memberIds.filter((id) => bandSet.has(id));
  const overlapSet = new Set(overlap);
  return {
    memberIds: memberIds.filter((id) => !overlapSet.has(id)),
    bandIds: bandIds.filter((id) => !overlapSet.has(id)),
    overlap,
  };
}

function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function rowToMemberLink(row: {
  id?: string;
  name?: string | null;
  name_ja?: string | null;
  music8_artist_slug?: string | null;
  kind?: string | null;
}): ArtistMemberLink | null {
  if (!row.id) return null;
  return {
    id: row.id,
    name: (row.name ?? '').trim() || row.id,
    name_ja: row.name_ja ?? null,
    music8_artist_slug: row.music8_artist_slug ?? null,
    kind: row.kind ?? null,
  };
}

export function hintsReferToArtist(
  hints: Music8MemberHint[],
  artist: { name: string | null; music8_artist_slug: string | null },
): boolean {
  const slug = (artist.music8_artist_slug ?? '').trim().toLowerCase();
  const name = (artist.name ?? '').trim().toLowerCase();
  const nameNoThe = name.replace(/^\s*(?:the|a|an)\s+/, '');
  return hints.some((h) => {
    if (h.slug && slug && h.slug === slug) return true;
    const n = h.name.trim().toLowerCase();
    if (n && name && n === name) return true;
    if (n && nameNoThe && n === nameNoThe) return true;
    return false;
  });
}

export function memberHintsFromMusic8Members(raw: unknown): Music8MemberHint[] {
  if (!Array.isArray(raw)) return [];
  const out: Music8MemberHint[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const o = asObj(item);
    if (!o) continue;
    const slug = typeof o.slug === 'string' ? o.slug.trim().toLowerCase() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const key = slug || name.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ slug, name });
  }
  return out;
}

async function resolveArtistRow(
  admin: SupabaseClient,
  hint: Music8MemberHint,
): Promise<{
  id: string;
  kind: string | null;
  name: string | null;
  music8_artist_slug: string | null;
  music8_members: unknown;
} | null> {
  const cols = 'id, name, kind, music8_artist_slug, music8_members';
  if (hint.slug) {
    const { data, error } = await admin
      .from('artists')
      .select(cols)
      .eq('music8_artist_slug', hint.slug)
      .limit(2);
    if (!error && data?.length === 1) {
      const row = data[0] as {
        id?: string;
        kind?: string | null;
        name?: string | null;
        music8_artist_slug?: string | null;
        music8_members?: unknown;
      };
      if (row.id) {
        return {
          id: row.id,
          kind: row.kind ?? null,
          name: row.name ?? null,
          music8_artist_slug: row.music8_artist_slug ?? null,
          music8_members: row.music8_members,
        };
      }
    }
  }
  if (hint.name) {
    const { data, error } = await admin
      .from('artists')
      .select(cols)
      .ilike('name', hint.name)
      .limit(10);
    if (error || !data?.length) return null;
    const want = hint.name.trim().toLowerCase();
    const exact = data.find(
      (r) => String((r as { name?: string }).name ?? '').trim().toLowerCase() === want,
    );
    const row = (exact ?? (data.length === 1 ? data[0] : null)) as
      | {
          id?: string;
          kind?: string | null;
          name?: string | null;
          music8_artist_slug?: string | null;
          music8_members?: unknown;
        }
      | null;
    if (!row?.id) return null;
    return {
      id: row.id,
      kind: row.kind ?? null,
      name: row.name ?? null,
      music8_artist_slug: row.music8_artist_slug ?? null,
      music8_members: row.music8_members,
    };
  }
  return null;
}

export async function syncArtistMembersForArtist(
  admin: SupabaseClient,
  artistId: string,
  music8Members: unknown,
): Promise<{ linked: number; unresolved: string[] }> {
  const hints = memberHintsFromMusic8Members(music8Members);
  const unresolved: string[] = [];
  const { data: sourceRow, error: srcErr } = await admin
    .from('artists')
    .select('id, name, kind, music8_artist_slug')
    .eq('id', artistId)
    .maybeSingle();
  if (srcErr && srcErr.code !== '42P01') throw srcErr;
  const source = {
    id: artistId,
    kind: (sourceRow as { kind?: string | null } | null)?.kind ?? null,
    name: (sourceRow as { name?: string | null } | null)?.name ?? null,
    music8_artist_slug: (sourceRow as { music8_artist_slug?: string | null } | null)?.music8_artist_slug ?? null,
  };

  const pairs: { artist_id: string; member_artist_id: string }[] = [];
  const seen = new Set<string>();
  for (const hint of hints) {
    const target = await resolveArtistRow(admin, hint);
    if (!target) {
      unresolved.push(hint.name || hint.slug);
      continue;
    }
    const pair = directedMemberPair(source, target);
    if (!pair) continue;
    const otherListsUs = hintsReferToArtist(
      memberHintsFromMusic8Members(target.music8_members),
      source,
    );
    if (!otherListsUs) continue;
    const key = `${pair.artist_id}|${pair.member_artist_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(pair);
  }

  const { error: delErr } = await admin.from('artist_members').delete().eq('artist_id', artistId);
  if (delErr) {
    if (delErr.code === '42P01' || delErr.code === '42703') {
      return { linked: 0, unresolved };
    }
    throw delErr;
  }

  if (pairs.length === 0) return { linked: 0, unresolved };

  const { error: insErr } = await admin
    .from('artist_members')
    .upsert(pairs, { onConflict: 'artist_id,member_artist_id' });
  if (insErr) {
    if (insErr.code === '42P01' || insErr.code === '42703') {
      return { linked: 0, unresolved };
    }
    throw insErr;
  }
  return { linked: pairs.length, unresolved };
}

async function rowsToLinks(
  admin: SupabaseClient,
  ids: string[],
): Promise<ArtistMemberLink[]> {
  if (ids.length === 0) return [];
  const { data, error } = await admin
    .from('artists')
    .select('id, name, name_ja, music8_artist_slug, kind')
    .in('id', ids);
  if (error || !data) return [];
  const byId = new Map(data.map((r) => [(r as { id: string }).id, r]));
  const out: ArtistMemberLink[] = [];
  for (const id of ids) {
    const r = byId.get(id) as
      | {
          id: string;
          name?: string | null;
          name_ja?: string | null;
          music8_artist_slug?: string | null;
          kind?: string | null;
        }
      | undefined;
    if (!r?.id) continue;
    const link = rowToMemberLink(r);
    if (link) out.push(link);
  }
  return out;
}

export async function loadArtistMemberGraph(
  admin: SupabaseClient,
  artistId: string,
): Promise<{ members: ArtistMemberLink[]; bands: ArtistMemberLink[] }> {
  const empty = { members: [] as ArtistMemberLink[], bands: [] as ArtistMemberLink[] };
  const { data: asBand, error: e1 } = await admin
    .from('artist_members')
    .select('member_artist_id')
    .eq('artist_id', artistId);
  if (e1) {
    if (e1.code === '42P01' || e1.code === '42703') return empty;
    throw e1;
  }
  const { data: asMember, error: e2 } = await admin
    .from('artist_members')
    .select('artist_id')
    .eq('member_artist_id', artistId);
  if (e2) {
    if (e2.code === '42P01' || e2.code === '42703') return empty;
    throw e2;
  }
  const memberIds = (asBand ?? [])
    .map((r) => (r as { member_artist_id?: string }).member_artist_id)
    .filter((id): id is string => Boolean(id));
  const bandIds = (asMember ?? [])
    .map((r) => (r as { artist_id?: string }).artist_id)
    .filter((id): id is string => Boolean(id));
  return {
    members: await rowsToLinks(admin, memberIds),
    bands: await rowsToLinks(admin, bandIds),
  };
}

export async function searchArtistsForAdminLink(
  admin: SupabaseClient,
  query: string,
  opts?: { excludeId?: string | null; limit?: number },
): Promise<ArtistMemberLink[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 12, 1), 30);
  const excludeId = (opts?.excludeId ?? '').trim();
  const like = `%${escapeIlikeExact(q)}%`;
  const orValue = /[,():]/.test(q) ? `"${like.replace(/"/g, '')}"` : like;
  const cols = 'id, name, name_ja, music8_artist_slug, kind';
  let data: unknown[] | null = null;
  const { data: orData, error: orErr } = await admin
    .from('artists')
    .select(cols)
    .or(
      `name.ilike.${orValue},name_ja.ilike.${orValue},name_en.ilike.${orValue},music8_artist_slug.ilike.${orValue}`,
    )
    .limit(limit + 4);
  if (orErr && orErr.code !== '42703' && orErr.code !== '42P01') throw orErr;
  if (!orErr) {
    data = (orData ?? []) as unknown[];
  } else {
    const { data: byName, error: nameErr } = await admin
      .from('artists')
      .select(cols)
      .ilike('name', like)
      .limit(limit + 4);
    if (nameErr) {
      if (nameErr.code === '42P01' || nameErr.code === '42703') return [];
      throw nameErr;
    }
    data = (byName ?? []) as unknown[];
  }

  const out: ArtistMemberLink[] = [];
  const seen = new Set<string>();
  for (const raw of data ?? []) {
    const link = rowToMemberLink(raw as Parameters<typeof rowToMemberLink>[0]);
    if (!link || seen.has(link.id) || link.id === excludeId) continue;
    seen.add(link.id);
    out.push(link);
    if (out.length >= limit) break;
  }
  return out;
}

export async function loadAdminMemberHintStatuses(
  admin: SupabaseClient,
  opts: {
    sourceKind: string | null;
    music8Members: unknown;
    graph: { members: ArtistMemberLink[]; bands: ArtistMemberLink[] };
  },
): Promise<AdminMemberHintStatus[]> {
  const hints = memberHintsFromMusic8Members(opts.music8Members);
  if (hints.length === 0) return [];
  const linkedIds = new Set(
    [...opts.graph.members, ...opts.graph.bands].map((l) => l.id),
  );
  const linkedSlugs = new Set(
    [...opts.graph.members, ...opts.graph.bands]
      .map((l) => (l.music8_artist_slug ?? '').trim().toLowerCase())
      .filter(Boolean),
  );
  const linkedNames = new Set(
    [...opts.graph.members, ...opts.graph.bands]
      .map((l) => l.name.trim().toLowerCase())
      .filter(Boolean),
  );
  const out: AdminMemberHintStatus[] = [];
  for (const hint of hints) {
    const target = await resolveArtistRow(admin, hint);
    const matched = target ? rowToMemberLink(target) : null;
    const alreadyLinked = Boolean(
      (matched && linkedIds.has(matched.id)) ||
        (hint.slug && linkedSlugs.has(hint.slug)) ||
        (hint.name && linkedNames.has(hint.name.trim().toLowerCase())),
    );
    out.push({
      name: hint.name || hint.slug || '（無名）',
      slug: hint.slug,
      matched,
      alreadyLinked,
      roleGuess: guessHintLinkRole(opts.sourceKind, matched?.kind ?? null),
    });
  }
  return out;
}

export async function validateArtistMemberGraph(
  admin: SupabaseClient,
  selfId: string | null | undefined,
  opts: { memberIds: string[]; bandIds: string[] },
): Promise<{ ok: true; memberIds: string[]; bandIds: string[] } | { ok: false; error: string }> {
  const split = splitMemberGraphIds({
    selfId,
    memberIds: opts.memberIds,
    bandIds: opts.bandIds,
  });
  if (split.overlap.length > 0) {
    return { ok: false, error: '同じアーティストを所属バンドとメンバーの両方には登録できません。' };
  }
  const wanted = [...split.memberIds, ...split.bandIds];
  if (wanted.length === 0) return { ok: true, memberIds: [], bandIds: [] };
  const { data, error } = await admin.from('artists').select('id').in('id', wanted);
  if (error) {
    if (error.code === '42P01' || error.code === '42703') {
      return { ok: false, error: 'artist_members テーブルが未作成です。' };
    }
    return { ok: false, error: error.message };
  }
  const found = new Set((data ?? []).map((r) => (r as { id?: string }).id).filter(Boolean));
  const missing = wanted.filter((id) => !found.has(id));
  if (missing.length > 0) {
    return { ok: false, error: 'マスタに無いアーティスト ID が含まれています。' };
  }
  return { ok: true, memberIds: split.memberIds, bandIds: split.bandIds };
}

export async function replaceArtistMemberGraph(
  admin: SupabaseClient,
  artistId: string,
  opts: { memberIds: string[]; bandIds: string[] },
): Promise<{ members: ArtistMemberLink[]; bands: ArtistMemberLink[] }> {
  const checked = await validateArtistMemberGraph(admin, artistId, opts);
  if (!checked.ok) throw new Error(checked.error);

  const { error: delMembersErr } = await admin
    .from('artist_members')
    .delete()
    .eq('artist_id', artistId);
  if (delMembersErr) {
    if (delMembersErr.code === '42P01' || delMembersErr.code === '42703') {
      return { members: [], bands: [] };
    }
    throw delMembersErr;
  }
  const { error: delBandsErr } = await admin
    .from('artist_members')
    .delete()
    .eq('member_artist_id', artistId);
  if (delBandsErr) throw delBandsErr;

  const pairs: { artist_id: string; member_artist_id: string }[] = [];
  for (const memberId of checked.memberIds) {
    pairs.push({ artist_id: artistId, member_artist_id: memberId });
  }
  for (const bandId of checked.bandIds) {
    pairs.push({ artist_id: bandId, member_artist_id: artistId });
  }
  if (pairs.length > 0) {
    const { error: insErr } = await admin
      .from('artist_members')
      .upsert(pairs, { onConflict: 'artist_id,member_artist_id' });
    if (insErr) throw insErr;
  }

  const graph = await loadArtistMemberGraph(admin, artistId);
  const membersText = graph.members.map((m) => m.name).join(', ');
  if (membersText) {
    const { error: memErr } = await admin
      .from('artists')
      .update({ members: membersText, updated_at: new Date().toISOString() })
      .eq('id', artistId);
    if (memErr && memErr.code !== '42703') throw memErr;
  }
  return graph;
}
