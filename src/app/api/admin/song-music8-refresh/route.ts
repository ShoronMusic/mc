import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { attachMusic8SongDataIfFetched } from '@/lib/song-entities';
import { buildPersistableMusic8SongSnapshot } from '@/lib/music8-song-persist';
import { cleanTitle, getMainArtist, parseArtistTitle } from '@/lib/format-song-display';
import { resolveMusic8ContextForCommentPack } from '@/lib/music8-musicaichat';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * comment-pack と同じ引数に揃える（artistDisplay 相当 → main_artist、曲名 → song_title）。
 */
function resolveArtistSongLookupForAdmin(row: {
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
}): { artistLookup: string; songLookupTitle: string } | null {
  const ma = (row.main_artist ?? '').trim();
  const st = (row.song_title ?? '').trim();
  const disp = (row.display_title ?? '').trim();

  if (ma && st) {
    return { artistLookup: ma, songLookupTitle: st };
  }
  if (disp) {
    const parsed = parseArtistTitle(disp);
    if (!parsed) return null;
    const artistLookup = ma || getMainArtist(parsed.artist).trim();
    const songPart = st || cleanTitle(parsed.song).trim();
    if (!artistLookup || !songPart) return null;
    return { artistLookup, songLookupTitle: songPart };
  }
  return null;
}

/**
 * POST: `songs.music8_song_data` を Music8 から再取得して上書き更新（管理者用）。
 * Body: { songId: string }
 * - comment-pack / commentary と同じ `resolveMusic8ContextForCommentPack`（musicaichat 索引 + GCS は `fetchJsonWithOptionalGcsAuth`）を利用。
 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: { songId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const songId = typeof body.songId === 'string' ? body.songId.trim() : '';
  if (!songId || !UUID_RE.test(songId)) {
    return NextResponse.json({ error: 'songId が無効です。' }, { status: 400 });
  }

  const { data: song, error: selErr } = await admin
    .from('songs')
    .select('id, main_artist, song_title, display_title')
    .eq('id', songId)
    .maybeSingle();

  if (selErr) {
    console.error('[admin/song-music8-refresh] select', selErr);
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!song) {
    return NextResponse.json({ error: '曲が見つかりません。' }, { status: 404 });
  }

  const lookup = resolveArtistSongLookupForAdmin(
    song as { main_artist: string | null; song_title: string | null; display_title: string | null },
  );
  if (!lookup) {
    return NextResponse.json(
      {
        error:
          'メインアーティストと曲タイトルの両方、または display_title が必要です。マスタのメタを修正してから再試行してください。',
      },
      { status: 400 },
    );
  }

  let videoId = '';
  try {
    const { data: firstVideo, error: vErr } = await admin
      .from('song_videos')
      .select('video_id')
      .eq('song_id', songId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (vErr && vErr.code !== '42P01') {
      console.warn('[admin/song-music8-refresh] song_videos', vErr.code, vErr.message);
    }
    if (typeof firstVideo?.video_id === 'string') {
      videoId = firstVideo.video_id.trim();
    }
  } catch (e) {
    console.warn('[admin/song-music8-refresh] song_videos exception', e);
  }

  let music8Json: Record<string, unknown> | null = null;
  try {
    const ctx = await resolveMusic8ContextForCommentPack(
      videoId,
      lookup.artistLookup,
      lookup.songLookupTitle,
    );
    const raw = ctx.musicaichatSong ?? ctx.fallbackMusic8Song;
    music8Json = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch (e) {
    console.error('[admin/song-music8-refresh] resolveMusic8ContextForCommentPack', e);
    return NextResponse.json({ error: 'Music8 の取得中にエラーが発生しました。' }, { status: 502 });
  }

  if (!music8Json) {
    return NextResponse.json(
      { ok: false, code: 'not_found', error: 'Music8 に該当する曲データが見つかりませんでした。' },
      { status: 404 },
    );
  }

  const snap = buildPersistableMusic8SongSnapshot(music8Json);
  if (!snap) {
    return NextResponse.json(
      {
        ok: false,
        code: 'unpersistable',
        error: 'Music8 の応答から保存用スナップショットを組み立てられませんでした。',
      },
      { status: 422 },
    );
  }

  try {
    await attachMusic8SongDataIfFetched(admin, songId, music8Json);
  } catch (e) {
    console.error('[admin/song-music8-refresh] attachMusic8SongDataIfFetched', e);
    return NextResponse.json({ error: 'DB の更新に失敗しました。' }, { status: 500 });
  }

  const { data: after, error: afterErr } = await admin
    .from('songs')
    .select('music8_song_data')
    .eq('id', songId)
    .maybeSingle();

  if (afterErr) {
    console.warn('[admin/song-music8-refresh] post-update select', afterErr);
  }
  if (!after?.music8_song_data) {
    return NextResponse.json(
      { error: '更新後の確認で music8_song_data が空のままです。権限または列の有無を確認してください。' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, songId });
}
