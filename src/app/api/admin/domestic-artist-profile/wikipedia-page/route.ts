import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { searchWikipediaPageForArtist } from '@/lib/wikipedia-page-search';

export const dynamic = 'force-dynamic';

type ReqBody = {
  artistName?: unknown;
  nameJa?: unknown;
  descriptionEn?: unknown;
  catalog?: unknown;
};

function parseCatalog(v: unknown): 'domestic' | 'western' | 'unknown' {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (t === 'domestic') return 'domestic';
  if (t === 'western') return 'western';
  // 洋楽が主。未指定・unknown は英語版 Wikipedia を使う
  return 'western';
}

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  let body: ReqBody;
  try {
    body = (await request.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const artistName = typeof body.artistName === 'string' ? body.artistName.trim() : '';
  if (!artistName) {
    return NextResponse.json({ error: 'artistName が必要です。' }, { status: 400 });
  }

  const catalog = parseCatalog(body.catalog);

  const result = await searchWikipediaPageForArtist({
    artistName,
    nameJa: typeof body.nameJa === 'string' ? body.nameJa.trim() : null,
    descriptionEn: typeof body.descriptionEn === 'string' ? body.descriptionEn.trim() : null,
    catalog,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    wikipediaPage: result.wikipediaPage,
    url: result.url,
    lang: result.lang,
  });
}
