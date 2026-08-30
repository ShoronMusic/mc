/**
 * バンド ↔ メンバー（artist_members）。Music8 member / music8_members から解決する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ArtistMemberLink = {
  id: string;
  name: string;
  name_ja: string | null;
  music8_artist_slug: string | null;
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
    .select('id, name, name_ja, music8_artist_slug')
    .in('id', ids);
  if (error || !data) return [];
  const byId = new Map(data.map((r) => [(r as { id: string }).id, r]));
  const out: ArtistMemberLink[] = [];
  for (const id of ids) {
    const r = byId.get(id) as
      | { id: string; name?: string | null; name_ja?: string | null; music8_artist_slug?: string | null }
      | undefined;
    if (!r?.id) continue;
    out.push({
      id: r.id,
      name: (r.name ?? '').trim() || id,
      name_ja: r.name_ja ?? null,
      music8_artist_slug: r.music8_artist_slug ?? null,
    });
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
