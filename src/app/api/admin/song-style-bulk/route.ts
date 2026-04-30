import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { SONG_STYLE_OPTIONS } from '@/lib/song-styles';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReqBody = {
  songIds?: unknown;
  style?: unknown;
};

function toUniqueSongIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of input) {
    if (typeof v !== 'string') continue;
    const id = v.trim();
    if (!UUID_RE.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

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

  const songIds = toUniqueSongIds(body.songIds);
  if (songIds.length === 0) {
    return NextResponse.json({ error: 'songIds が空です。' }, { status: 400 });
  }

  const style = typeof body.style === 'string' ? body.style.trim() : '';
  if (!style || !SONG_STYLE_OPTIONS.includes(style as (typeof SONG_STYLE_OPTIONS)[number])) {
    return NextResponse.json({ error: 'style が不正です。' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('songs')
    .update({ style })
    .in('id', songIds)
    .select('id');
  if (error) {
    console.error('[admin/song-style-bulk] update songs failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    style,
    updatedCount: Array.isArray(data) ? data.length : 0,
  });
}
