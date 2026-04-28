import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { formatMusic8ArtistDisplayLines, type Music8ArtistJson } from '@/lib/music8-artist-display';

export const dynamic = 'force-dynamic';

type ReqBody = {
  artistName?: unknown;
  jsonText?: unknown;
  jsonUrl?: unknown;
};

function asObj(x: unknown): Record<string, unknown> | null {
  if (x && typeof x === 'object' && !Array.isArray(x)) return x as Record<string, unknown>;
  return null;
}

function normalizeArtistNameLoose(name: string): string {
  return name.replace(/^\s*(?:The|A|An)\s+/i, '').trim().toLowerCase();
}

function normalizeArtistSource(raw: unknown): Music8ArtistJson | null {
  const obj = asObj(raw);
  if (!obj) return null;
  const acf = asObj(obj.acf);
  const merged = acf ? { ...obj, ...acf } : obj;
  if (typeof merged.name !== 'string' || !merged.name.trim()) return null;
  return merged as Music8ArtistJson;
}

/**
 * POST: 管理画面のアーティストページで貼り付けた Music8 個別 JSON から artists を補完更新。
 * Body: { artistName: string, jsonText: string }
 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: ReqBody;
  try {
    body = (await request.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const artistName = typeof body.artistName === 'string' ? body.artistName.trim() : '';
  const jsonText = typeof body.jsonText === 'string' ? body.jsonText.trim() : '';
  const jsonUrl = typeof body.jsonUrl === 'string' ? body.jsonUrl.trim() : '';
  if (!artistName) {
    return NextResponse.json({ error: 'artistName が必要です。' }, { status: 400 });
  }

  let resolvedJsonText = jsonText;
  // URL 指定時は貼り付けテキストより優先（サンプル入力が残っていても実URLを使う）
  if (jsonUrl) {
    let url: URL;
    try {
      url = new URL(jsonUrl);
    } catch {
      return NextResponse.json({ error: 'jsonUrl の形式が不正です。' }, { status: 400 });
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return NextResponse.json({ error: 'jsonUrl は http/https のみ対応です。' }, { status: 400 });
    }
    try {
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) {
        return NextResponse.json(
          { error: `jsonUrl の取得に失敗しました（HTTP ${res.status}）。` },
          { status: 400 },
        );
      }
      resolvedJsonText = await res.text();
    } catch {
      return NextResponse.json({ error: 'jsonUrl の取得に失敗しました。' }, { status: 400 });
    }
  }

  if (!resolvedJsonText) {
    return NextResponse.json({ error: 'jsonText または jsonUrl が必要です。' }, { status: 400 });
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(resolvedJsonText);
  } catch {
    return NextResponse.json({ error: 'JSON の形式が不正です。' }, { status: 400 });
  }

  const src = normalizeArtistSource(parsedUnknown);
  if (!src) {
    return NextResponse.json({ error: 'Music8 アーティスト JSON として解釈できません。' }, { status: 400 });
  }

  const fmt = formatMusic8ArtistDisplayLines(src);
  // ライブラリの表示名（The Police など）を優先して維持する
  const name = artistName || (src.name ?? '').trim();
  const slug = typeof src.slug === 'string' && src.slug.trim() ? src.slug.trim() : null;
  const nameJa = typeof src.artistjpname === 'string' && src.artistjpname.trim() ? src.artistjpname.trim() : null;
  const kind = fmt.occupationDisplay?.trim() || null;
  const originCountry = fmt.origin?.trim() || null;
  const activePeriod = fmt.activeYears?.trim() || null;
  const members = fmt.memberDisplay?.trim() || null;
  const youtubeChannelUrl = fmt.youtubeChannelHref?.trim() || null;
  const youtubeChannelTitle = youtubeChannelUrl ? `${fmt.nameDisplay || name} YouTube Channel` : null;
  const imageUrl = fmt.imageUrl?.trim() || null;
  const profileText = fmt.descriptionJa?.trim() || null;

  const normalizedQuery = normalizeArtistNameLoose(artistName);
  let existing: { id?: string } | null = null;
  const { data: exactByName, error: selErr } = await admin
    .from('artists')
    .select('id, name')
    .ilike('name', artistName);
  if (selErr && selErr.code !== '42P01') {
    console.error('[admin/artist-master-import-json] select', selErr);
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (Array.isArray(exactByName) && exactByName.length > 0) {
    existing = exactByName[0] as { id?: string };
  } else if (slug) {
    const { data: bySlug, error: slugErr } = await admin
      .from('artists')
      .select('id')
      .eq('music8_artist_slug', slug)
      .limit(1)
      .maybeSingle();
    if (slugErr && slugErr.code !== '42P01') {
      console.error('[admin/artist-master-import-json] select by slug', slugErr);
      return NextResponse.json({ error: slugErr.message }, { status: 500 });
    }
    existing = (bySlug as { id?: string } | null) ?? null;
  }

  if (!existing && Array.isArray(exactByName)) {
    const loose = exactByName.find((r) => normalizeArtistNameLoose(String((r as { name?: string }).name ?? '')) === normalizedQuery);
    if (loose) existing = loose as { id?: string };
  }

  const patch = {
    name,
    music8_artist_slug: slug,
    name_ja: nameJa,
    kind,
    origin_country: originCountry,
    active_period: activePeriod,
    members,
    youtube_channel_title: youtubeChannelTitle,
    youtube_channel_url: youtubeChannelUrl,
    image_url: imageUrl,
    profile_text: profileText,
  };

  if (existing?.id) {
    const { error: updErr } = await admin.from('artists').update(patch).eq('id', existing.id);
    if (updErr) {
      console.error('[admin/artist-master-import-json] update', updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, artistId: existing.id, mode: 'update' });
  }

  const { data: ins, error: insErr } = await admin.from('artists').insert(patch).select('id').single();
  if (insErr) {
    console.error('[admin/artist-master-import-json] insert', insErr);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, artistId: (ins as { id?: string } | null)?.id ?? null, mode: 'insert' });
}

