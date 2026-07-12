import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';

export const dynamic = 'force-dynamic';

function normalizeArtistNameLoose(name: string): string {
  return name.replace(/^\s*(?:The|A|An)\s+/i, '').trim().toLowerCase();
}

export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const url = new URL(request.url);
  const id = (url.searchParams.get('id') ?? '').trim();
  const name = (url.searchParams.get('name') ?? '').trim();

  if (id) {
    const { data, error } = await admin.from('artists').select('*').eq('id', id).maybeSingle();
    if (error) {
      console.error('[admin/domestic-artist-profile/lookup]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ artist: data ?? null });
  }

  if (!name) {
    return NextResponse.json({ error: 'name または id クエリが必要です。' }, { status: 400 });
  }

  const slug = artistNameToMusic8Slug(name);
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  const append = (list: Record<string, unknown>[] | null | undefined) => {
    if (!Array.isArray(list)) return;
    for (const r of list) {
      const id = typeof r.id === 'string' ? r.id : '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rows.push(r);
    }
  };

  if (slug) {
    const { data } = await admin.from('artists').select('*').eq('music8_artist_slug', slug).limit(20);
    append((data ?? []) as Record<string, unknown>[]);
  }

  const { data: byName } = await admin.from('artists').select('*').ilike('name', name).limit(20);
  append((byName ?? []) as Record<string, unknown>[]);

  const q = normalizeArtistNameLoose(name);
  const picked =
    rows.find((r) => normalizeArtistNameLoose(String(r.name ?? '')) === q) ??
    rows.find((r) => typeof r.name === 'string' && r.name.toLowerCase() === name.toLowerCase()) ??
    rows[0] ??
    null;

  return NextResponse.json({ artist: picked });
}
