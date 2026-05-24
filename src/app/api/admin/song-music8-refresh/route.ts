import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  attachMusic8JsonToSongMaster,
  isValidAdminSongId,
  loadAdminSongMusic8Context,
} from '@/lib/admin-song-music8-resolve';
import { resolveMusic8ContextForCommentPack } from '@/lib/music8-musicaichat';
import { fetchMusic8SongFromWpRest, isMusic8WpRestEnabled } from '@/lib/music8-wp-rest';

export const dynamic = 'force-dynamic';

/**
 * POST: `songs.music8_song_data` を Music8 から再取得して上書き更新（管理者用）。
 * Body: { songId: string }
 * 1) musicaichat 索引 + GCS 曲 JSON
 * 2) 見つからなければ WordPress REST（`MUSIC8_WP_REST_BASE_URL`）
 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

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
  let source: 'json' | 'wp_rest' = 'json';

  try {
    const packCtx = await resolveMusic8ContextForCommentPack(
      ctx.videoId,
      ctx.lookup.artistLookup,
      ctx.lookup.songLookupTitle,
    );
    const raw = packCtx.musicaichatSong ?? packCtx.fallbackMusic8Song;
    music8Json = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch (e) {
    console.error('[admin/song-music8-refresh] resolveMusic8ContextForCommentPack', e);
    return NextResponse.json({ error: 'Music8 の取得中にエラーが発生しました。' }, { status: 502 });
  }

  if (!music8Json && isMusic8WpRestEnabled()) {
    try {
      music8Json = await fetchMusic8SongFromWpRest({
        artistLookup: ctx.lookup.artistLookup,
        songLookupTitle: ctx.lookup.songLookupTitle,
        videoId: ctx.videoId || null,
        music8SongId: ctx.music8SongId,
      });
      if (music8Json) source = 'wp_rest';
    } catch (e) {
      console.error('[admin/song-music8-refresh] wp rest fallback', e);
    }
  }

  if (!music8Json) {
    return NextResponse.json(
      {
        ok: false,
        code: 'not_found',
        error:
          'Music8 曲 JSON にも WordPress REST にも該当データが見つかりませんでした。WP 登録直後は「WP REST から補完」を試してください。',
      },
      { status: 404 },
    );
  }

  const attached = await attachMusic8JsonToSongMaster(songId, music8Json);
  if (!attached.ok) {
    return NextResponse.json({ error: attached.error }, { status: attached.status });
  }

  return NextResponse.json({ ok: true, songId, source });
}
