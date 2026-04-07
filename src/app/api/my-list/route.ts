import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractVideoId, normalizeToAbsoluteUrlIfStandalone } from '@/lib/youtube';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { syncMyListItemLibraryArtists } from '@/lib/my-list-sync-library-artists';

export const dynamic = 'force-dynamic';

const ALLOWED_SOURCES = new Set([
  'manual_url',
  'song_history',
  'favorites',
  'extension',
  'import',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MyListItemRow = {
  id: string;
  video_id: string;
  url: string;
  title: string | null;
  artist: string | null;
  note: string | null;
  source: string;
  music8_song_id: number | null;
  created_at: string;
  updated_at: string;
};

function tableMissingResponse() {
  return NextResponse.json(
    {
      error:
        'マイリストテーブルがありません。docs/supabase-user-my-list-table.md の SQL を実行してください。',
    },
    { status: 503 },
  );
}

function parseVideoId(urlRaw: string | undefined, videoIdRaw: string | undefined): string | null {
  const vid = typeof videoIdRaw === 'string' ? videoIdRaw.trim() : '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(vid)) return vid;

  const url = typeof urlRaw === 'string' ? urlRaw.trim() : '';
  if (!url) return null;

  let fromUrl = extractVideoId(url);
  if (fromUrl) return fromUrl;

  const abs = normalizeToAbsoluteUrlIfStandalone(url);
  if (abs) {
    fromUrl = extractVideoId(abs);
    if (fromUrl) return fromUrl;
  }

  return null;
}

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function clampStr(s: string | undefined, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * GET: 自分のマイリスト一覧（新しい順）
 */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('user_my_list_items')
    .select(
      'id, video_id, url, title, artist, note, source, music8_song_id, created_at, updated_at',
    )
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === '42P01') return tableMissingResponse();
    console.error('[my-list GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: (data ?? []) as MyListItemRow[] });
}

/**
 * POST: 追加
 * Body: { url?: string, videoId?: string, title?, artist?, note?, source?, music8SongId? }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  let body: {
    url?: string;
    videoId?: string;
    title?: string;
    artist?: string;
    note?: string;
    source?: string;
    music8SongId?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const videoId = parseVideoId(body?.url, body?.videoId);
  if (!videoId) {
    return NextResponse.json(
      { error: '有効な YouTube の URL または 11 文字の videoId を指定してください。' },
      { status: 400 },
    );
  }

  const source =
    typeof body?.source === 'string' && ALLOWED_SOURCES.has(body.source.trim())
      ? body.source.trim()
      : 'manual_url';

  let title = clampStr(body?.title, 500);
  let artist = clampStr(body?.artist, 500);
  const note = clampStr(body?.note, 4000);
  const url = typeof body?.url === 'string' && body.url.trim() ? body.url.trim() : watchUrl(videoId);

  if (!title || !artist) {
    const oembed = await fetchOEmbed(videoId);
    if (!title && oembed?.title) title = oembed.title.slice(0, 500);
    if (!artist && oembed?.author_name) artist = oembed.author_name.slice(0, 500);
  }

  const music8SongId =
    typeof body?.music8SongId === 'number' && Number.isFinite(body.music8SongId)
      ? Math.floor(body.music8SongId)
      : null;

  const insertRow: Record<string, unknown> = {
    user_id: session.user.id,
    video_id: videoId,
    url: url.length > 2000 ? url.slice(0, 2000) : url,
    title,
    artist,
    note,
    source,
  };
  if (music8SongId != null) {
    insertRow.music8_song_id = music8SongId;
  }

  const { error } = await supabase.from('user_my_list_items').insert(insertRow);

  if (error) {
    if (error.code === '23505') {
      const { data: existing, error: selErr } = await supabase
        .from('user_my_list_items')
        .select(
          'id, video_id, url, title, artist, note, source, music8_song_id, created_at, updated_at',
        )
        .eq('user_id', session.user.id)
        .eq('video_id', videoId)
        .maybeSingle();

      if (selErr || !existing) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      return NextResponse.json({
        ok: true,
        duplicate: true,
        item: existing as MyListItemRow,
      });
    }
    if (error.code === '42P01') return tableMissingResponse();
    console.error('[my-list POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: inserted, error: selErr } = await supabase
    .from('user_my_list_items')
    .select('id, video_id, url, title, artist, note, source, music8_song_id, created_at, updated_at')
    .eq('user_id', session.user.id)
    .eq('video_id', videoId)
    .maybeSingle();

  if (selErr || !inserted) {
    return NextResponse.json({ ok: true });
  }

  await syncMyListItemLibraryArtists(
    supabase,
    session.user.id,
    inserted.id,
    inserted.artist,
  );

  return NextResponse.json({ ok: true, item: inserted as MyListItemRow });
}

/**
 * PATCH: メタ更新 ?id=<uuid>
 * Body: { title?, artist?, note? }（いずれか必須）
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim() ?? '';
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id（UUID）が必要です。' }, { status: 400 });
  }

  let body: { title?: string; artist?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, string | null> = {};
  if (typeof body.title === 'string') patch.title = clampStr(body.title, 500);
  if (typeof body.artist === 'string') patch.artist = clampStr(body.artist, 500);
  if (typeof body.note === 'string') patch.note = clampStr(body.note, 4000);

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'title / artist / note のいずれかを指定してください。' }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('user_my_list_items')
    .update(patch)
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select('id, video_id, url, title, artist, note, source, music8_song_id, created_at, updated_at')
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return tableMissingResponse();
    console.error('[my-list PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: '見つかりません。' }, { status: 404 });
  }

  await syncMyListItemLibraryArtists(supabase, session.user.id, data.id, data.artist);

  return NextResponse.json({ ok: true, item: data as MyListItemRow });
}

/**
 * DELETE: ?id=<uuid>
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim() ?? '';
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id（UUID）が必要です。' }, { status: 400 });
  }

  const { data: deleted, error } = await supabase
    .from('user_my_list_items')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select('id');

  if (error) {
    if (error.code === '42P01') return tableMissingResponse();
    console.error('[my-list DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!deleted?.length) {
    return NextResponse.json({ error: '見つかりません。' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
