import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { searchYoutubeChannelForArtist } from '@/lib/youtube-channel-search';

export const dynamic = 'force-dynamic';

type ReqBody = {
  artistName?: unknown;
  nameJa?: unknown;
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
  const nameJa = typeof body.nameJa === 'string' ? body.nameJa.trim() : null;

  if (!artistName) {
    return NextResponse.json({ error: 'artistName が必要です。' }, { status: 400 });
  }

  const result = await searchYoutubeChannelForArtist({ artistName, nameJa });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    query: result.query,
    selected: result.selected,
    candidates: result.candidates,
  });
}
