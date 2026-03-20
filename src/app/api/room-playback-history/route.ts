import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStyleAdminUserIds } from '@/lib/style-admin';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import {
  getArtistAndSong,
  getMainArtist,
  isLikelyPersonalChannelName,
  parseArtistTitleFromDescription,
  cleanAuthor,
  songTitleMayNeedDescriptionCrossCheck,
  refineSongTitleWithDescription,
} from '@/lib/format-song-display';
import { getVideoSnippet } from '@/lib/youtube-search';
import { getOrAssignStyle, setStyleInDb } from '@/lib/song-style';
import { upsertSongAndVideo, updateSongStyle, incrementSongPlayCount } from '@/lib/song-entities';
import { SONG_STYLE_OPTIONS } from '@/lib/song-styles';
import type { SongStyle } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

const TWO_MINUTES_MS = 2 * 60 * 1000;

export type RoomPlaybackHistoryRow = {
  id: string;
  room_id: string;
  video_id: string;
  display_name: string;
  is_guest: boolean;
  played_at: string;
  title: string | null;
  artist_name: string | null;
  style: string | null;
};

/**
 * GET: ルームの視聴履歴一覧（全件、played_at 降順）
 * Query: roomId
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId')?.trim() ?? '';
  if (!roomId) {
    return NextResponse.json({ error: 'roomId is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('room_playback_history')
    .select('id, room_id, video_id, display_name, is_guest, played_at, title, artist_name, style')
    .eq('room_id', roomId)
    .order('played_at', { ascending: false });

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: '視聴履歴テーブルがありません。docs/supabase-room-playback-history-table.md の SQL を実行してください。' },
        { status: 503 }
      );
    }
    console.error('[room-playback-history GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const res = NextResponse.json({ items: data ?? [] });
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res;
}

/**
 * POST: 視聴履歴に1件追加（曲が流れてから約10秒後にクライアントから呼ぶ想定）
 * Body: { roomId, videoId, displayName, isGuest }
 * - 同じ人・同じ曲が2分以内なら同一扱いで挿入しない
 * - ゲストは display_name を "ニックネーム (G)" 形式で保存
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  let body: { roomId?: string; videoId?: string; displayName?: string; isGuest?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
  const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const isGuest = Boolean(body?.isGuest);

  if (!roomId || !videoId) {
    return NextResponse.json({ error: 'roomId and videoId are required' }, { status: 400 });
  }

  const displayNameToStore = displayName
    ? (isGuest ? `${displayName} (G)` : displayName)
    : (isGuest ? 'ゲスト (G)' : 'ゲスト');

  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;

  const cutoff = new Date(Date.now() - TWO_MINUTES_MS).toISOString();

  if (userId) {
    const { data: existing } = await supabase
      .from('room_playback_history')
      .select('id')
      .eq('room_id', roomId)
      .eq('video_id', videoId)
      .eq('user_id', userId)
      .gte('played_at', cutoff)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, skipped: 'duplicate' });
    }
  } else {
    const { data: existing } = await supabase
      .from('room_playback_history')
      .select('id')
      .eq('room_id', roomId)
      .eq('video_id', videoId)
      .eq('display_name', displayNameToStore)
      .eq('is_guest', true)
      .gte('played_at', cutoff)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, skipped: 'duplicate' });
    }
  }

  const oembed = await fetchOEmbed(videoId);
  let title = oembed?.title ?? null;
  let authorName = oembed?.author_name ?? null;

  const pre = getArtistAndSong(title ?? videoId, authorName);
  const needSnippet =
    !pre.artist || songTitleMayNeedDescriptionCrossCheck(pre.song);
  const snippet = needSnippet ? await getVideoSnippet(videoId) : null;

  let { artist, song } = getArtistAndSong(title ?? videoId, authorName, {
    videoDescription: snippet?.description ?? null,
  });

  const effectiveAuthor =
    authorName && cleanAuthor(authorName) && !isLikelyPersonalChannelName(cleanAuthor(authorName))
      ? authorName
      : null;
  let songId: string | null = null;
  try {
    songId = await upsertSongAndVideo({
      supabase,
      videoId,
      mainArtist: artist ?? effectiveAuthor ?? null,
      songTitle: song ?? (title ?? videoId),
      variant: 'official',
    });
  } catch (e) {
    console.error('[room-playback-history] upsertSongAndVideo', e);
  }

  if (!artist) {
    const snippetForArtist = snippet ?? (await getVideoSnippet(videoId));
    if (snippetForArtist?.description) {
      const fromDesc = parseArtistTitleFromDescription(snippetForArtist.description);
      if (fromDesc) {
        artist = getMainArtist(fromDesc.artist);
        song = refineSongTitleWithDescription(fromDesc.song, snippetForArtist.description);
      } else if (
        snippetForArtist.channelTitle &&
        !isLikelyPersonalChannelName(snippetForArtist.channelTitle.trim())
      ) {
        artist = snippetForArtist.channelTitle.trim();
      }
      if (!title && snippetForArtist.title) title = snippetForArtist.title;
    }
  }

  let style: string | null = null;
  try {
    style = await getOrAssignStyle(
      supabase,
      videoId,
      song,
      artist
    );
    if (style && songId) {
      await updateSongStyle(supabase, songId, style);
    }
  } catch (e) {
    console.error('[room-playback-history] getOrAssignStyle', e);
  }

  const { error } = await supabase.from('room_playback_history').insert({
    room_id: roomId,
    video_id: videoId,
    display_name: displayNameToStore,
    is_guest: isGuest,
    user_id: userId,
    title: title ?? videoId,
    artist_name: artist ?? effectiveAuthor ?? null,
    style,
  });

  if (!error && songId) {
    await incrementSongPlayCount(supabase, songId);
  }

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: '視聴履歴テーブルがありません。docs/supabase-room-playback-history-table.md の SQL を実行してください。' },
        { status: 503 }
      );
    }
    console.error('[room-playback-history POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * PATCH: 視聴履歴のスタイルをユーザーが修正。song_style キャッシュと当該行の style を更新。
 * Body: { id, videoId, style }
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  let body: { id?: string; videoId?: string; style?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
  const style = typeof body?.style === 'string' ? body.style.trim() : '';

  if (!id || !videoId) {
    return NextResponse.json({ error: 'id and videoId are required' }, { status: 400 });
  }
  if (!SONG_STYLE_OPTIONS.includes(style as (typeof SONG_STYLE_OPTIONS)[number])) {
    return NextResponse.json({ error: 'Invalid style' }, { status: 400 });
  }

  const adminIds = getStyleAdminUserIds();
  if (adminIds.length > 0) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid || !adminIds.includes(uid)) {
      return NextResponse.json(
        { error: 'スタイル変更は管理者のみ行えます。ログインしている管理者アカウントで操作してください。' },
        { status: 403 }
      );
    }
  }

  const styleCacheSaved = await setStyleInDb(supabase, videoId, style as SongStyle);

  // サービスロールがあれば RLS をバイパスして更新（ゲスト・他ユーザー貼り曲でもスタイル変更可能）
  const admin = createAdminClient();
  const updateClient = admin ?? supabase;
  const { data: updated, error } = await updateClient
    .from('room_playback_history')
    .update({ style })
    .eq('id', id)
    .select('id, style');

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: '視聴履歴テーブルがありません。' },
        { status: 503 }
      );
    }
    if (error.code === '42703') {
      return NextResponse.json(
        { error: '視聴履歴に style カラムがありません。docs/supabase-room-playback-history-table.md のテーブル定義を確認してください。' },
        { status: 503 }
      );
    }
    console.error('[room-playback-history PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: '該当する履歴が見つかりません。id が正しいか、room_playback_history に style カラムがあるか確認してください。' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    style: updated[0]?.style,
    styleCacheSaved,
  });
}
