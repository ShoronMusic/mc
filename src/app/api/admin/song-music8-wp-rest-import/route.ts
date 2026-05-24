import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  attachMusic8JsonToSongMaster,
  isValidAdminSongId,
  loadAdminSongMusic8Context,
} from '@/lib/admin-song-music8-resolve';
import { fetchMusic8SongFromWpRest, isMusic8WpRestEnabled } from '@/lib/music8-wp-rest';

export const dynamic = 'force-dynamic';

/**
 * POST: WordPress REST API から曲投稿を取得し songs 詳細メタを補完（JSON ファイル不要）。
 * Body: { songId: string }
 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  if (!isMusic8WpRestEnabled()) {
    return NextResponse.json(
      { error: 'MUSIC8_WP_REST_BASE_URL が無効です（0/off/false でオフ）。' },
      { status: 503 },
    );
  }

  let body: { songId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const songId = typeof body.songId === 'string' ? body.songId.trim() : '';
  if (!isValidAdminSongId(songId)) {
    return NextResponse.json({ error: 'songId が無効です。' }, { status: 400 });
  }

  const loaded = await loadAdminSongMusic8Context(songId);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const { ctx } = loaded;
  let music8Json: Record<string, unknown> | null = null;
  try {
    music8Json = await fetchMusic8SongFromWpRest({
      artistLookup: ctx.lookup.artistLookup,
      songLookupTitle: ctx.lookup.songLookupTitle,
      videoId: ctx.videoId || null,
      music8SongId: ctx.music8SongId,
    });
  } catch (e) {
    console.error('[admin/song-music8-wp-rest-import] fetch', e);
    return NextResponse.json({ error: 'WordPress REST の取得中にエラーが発生しました。' }, { status: 502 });
  }

  if (!music8Json) {
    return NextResponse.json(
      {
        ok: false,
        code: 'not_found',
        error:
          'WordPress REST に該当する曲投稿が見つかりませんでした。アーティスト slug・曲 slug・video_id を確認してください。',
      },
      { status: 404 },
    );
  }

  const attached = await attachMusic8JsonToSongMaster(songId, music8Json);
  if (!attached.ok) {
    return NextResponse.json({ error: attached.error }, { status: attached.status });
  }

  return NextResponse.json({
    ok: true,
    songId,
    source: 'wp_rest',
    music8_song_id: typeof music8Json.id === 'number' ? music8Json.id : null,
  });
}
