import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { searchSpotifyArtistByName } from '@/lib/spotify-search-track';

export const dynamic = 'force-dynamic';

type ReqBody = {
  artistName?: unknown;
  nameJa?: unknown;
  descriptionEn?: unknown;
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

  const result = await searchSpotifyArtistByName({
    artistName,
    nameJa: typeof body.nameJa === 'string' ? body.nameJa.trim() : null,
    descriptionEn: typeof body.descriptionEn === 'string' ? body.descriptionEn.trim() : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    query: result.query,
    selected: result.selected,
  });
}
