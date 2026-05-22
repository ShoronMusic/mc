import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  normalizeMusic8ArtistSource,
  upsertArtistFromMusic8Json,
} from '@/lib/music8-artist-import';

export const dynamic = 'force-dynamic';

type ReqBody = {
  artistName?: unknown;
  jsonText?: unknown;
  jsonUrl?: unknown;
};

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

  if (!normalizeMusic8ArtistSource(parsedUnknown)) {
    return NextResponse.json({ error: 'Music8 アーティスト JSON として解釈できません。' }, { status: 400 });
  }

  const result = await upsertArtistFromMusic8Json({
    admin,
    rawJson: parsedUnknown,
    displayNameOverride: artistName,
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    artistId: result.artistId,
    mode: result.mode === 'dry-run' ? 'update' : result.mode,
    patchKeys: Object.keys(result.patch),
  });
}
