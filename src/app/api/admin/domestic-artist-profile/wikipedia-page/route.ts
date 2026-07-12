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

  const catalog =
    typeof body.catalog === 'string' && body.catalog.trim().toLowerCase() === 'western'
      ? 'western'
      : 'domestic';

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
