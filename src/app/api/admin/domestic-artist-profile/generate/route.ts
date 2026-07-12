import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { generateAdminArtistProfile } from '@/lib/admin-artist-profile-generate';
import type { AdminArtistProfileCatalog } from '@/lib/admin-artist-profile-prompt';

export const dynamic = 'force-dynamic';

type ReqBody = {
  artistName?: unknown;
  catalog?: unknown;
};

function parseCatalog(v: unknown): AdminArtistProfileCatalog {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (t === 'western') return 'western';
  return 'domestic';
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

  const {
    data: { user },
  } = await gate.supabase.auth.getUser();

  const result = await generateAdminArtistProfile({
    artistName,
    catalog: parseCatalog(body.catalog),
    userId: user?.id ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    model: result.model,
    draft: result.draft,
    rawFields: result.rawFields,
  });
}
