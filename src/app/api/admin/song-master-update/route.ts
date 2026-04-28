import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ReqBody = {
  songId?: unknown;
  displayTitle?: unknown;
  mainArtist?: unknown;
  songTitle?: unknown;
  style?: unknown;
  originalReleaseDate?: unknown;
};

function toNullableTrimmed(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
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

  const songId = typeof body.songId === 'string' ? body.songId.trim() : '';
  if (!songId || !UUID_RE.test(songId)) {
    return NextResponse.json({ error: 'songId が無効です。' }, { status: 400 });
  }

  const displayTitle = toNullableTrimmed(body.displayTitle);
  const mainArtist = toNullableTrimmed(body.mainArtist);
  const songTitle = toNullableTrimmed(body.songTitle);
  const style = toNullableTrimmed(body.style);
  const originalReleaseDate = toNullableTrimmed(body.originalReleaseDate);

  if (originalReleaseDate && !ISO_DATE_RE.test(originalReleaseDate)) {
    return NextResponse.json(
      { error: 'original_release_date は YYYY-MM-DD 形式で入力してください。' },
      { status: 400 },
    );
  }

  const patch = {
    display_title: displayTitle,
    main_artist: mainArtist,
    song_title: songTitle,
    style,
    original_release_date: originalReleaseDate,
  };

  const { error } = await admin.from('songs').update(patch).eq('id', songId);
  if (error) {
    console.error('[admin/song-master-update] update songs failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, songId });
}
