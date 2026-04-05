import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStyleAdminUserIds } from '@/lib/style-admin';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import {
  getMainArtist,
  isGarbageArtistSongParse,
  isLikelyPersonalChannelName,
  parseArtistTitleFromDescription,
  cleanAuthor,
  refineSongTitleWithDescription,
  formatArtistTitle,
} from '@/lib/format-song-display';
import { resolveArtistSongForPackAsync } from '@/lib/youtube-artist-song-for-pack';
import { getVideoSnippet } from '@/lib/youtube-search';
import { resolveJapaneseEconomyWithMusicBrainz } from '@/lib/resolve-japanese-economy';
import { isJpDomesticOfficialChannelAiException } from '@/lib/jp-official-channel-exception';
import { isRoomJpAiUnlockEnabled } from '@/lib/room-jp-ai-unlock-server';
import { getOrAssignEra } from '@/lib/song-era';
import { getOrAssignStyle, setStyleInDb } from '@/lib/song-style';
import { upsertSongAndVideo, updateSongStyle, incrementSongPlayCount } from '@/lib/song-entities';
import { SONG_STYLE_OPTIONS } from '@/lib/song-styles';
import type { SongStyle } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

const TWO_MINUTES_MS = 2 * 60 * 1000;

function friendlySupabaseErrorMessage(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('invalid api key') || s.includes('invalid_api_key')) {
    return (
      'Supabase の API キーが無効です（Invalid API key）。' +
      'Vercel の環境変数で NEXT_PUBLIC_SUPABASE_URL・NEXT_PUBLIC_SUPABASE_ANON_KEY を確認してください。' +
      'スタイル変更でサービスロールを使う場合は SUPABASE_SERVICE_ROLE_KEY も正しい値か確認してください。'
    );
  }
  return raw;
}

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
  /** 同期部屋の選曲ラウンド（列未追加のDBでは null） */
  selection_round: number | null;
  /** `song_era` テーブル由来（GET 時に video_id で結合） */
  era: string | null;
};

function parseSelectionRoundForHistory(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  return n >= 1 ? n : null;
}

/** クライアント時計が未来にずれているとき since を無視する秒数 */
const SINCE_MAX_FUTURE_SKEW_MS = 120_000;

/**
 * GET: 部屋の視聴履歴一覧（played_at 降順）
 * Query: roomId, since（任意・ISO8601）— 指定時は played_at >= since の行のみ
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

  const sinceRaw = searchParams.get('since')?.trim() ?? '';
  let sinceIso: string | null = null;
  if (sinceRaw) {
    const sinceMs = new Date(sinceRaw).getTime();
    if (!Number.isNaN(sinceMs) && sinceMs <= Date.now() + SINCE_MAX_FUTURE_SKEW_MS) {
      sinceIso = new Date(sinceMs).toISOString();
    }
  }

  let historyQuery = supabase
    .from('room_playback_history')
    .select('id, room_id, video_id, display_name, is_guest, played_at, title, artist_name, style, selection_round')
    .eq('room_id', roomId);
  if (sinceIso) {
    historyQuery = historyQuery.gte('played_at', sinceIso);
  }
  const { data, error } = await historyQuery.order('played_at', { ascending: false });

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

  const rows = data ?? [];
  let items: RoomPlaybackHistoryRow[] = rows.map((row) => ({
    ...row,
    selection_round:
      typeof (row as { selection_round?: unknown }).selection_round === 'number' &&
      Number.isFinite((row as { selection_round: number }).selection_round)
        ? Math.floor((row as { selection_round: number }).selection_round)
        : null,
    era: null,
  }));
  const videoIds = Array.from(new Set(items.map((r) => r.video_id).filter(Boolean)));
  if (videoIds.length > 0) {
    const { data: eraRows, error: eraError } = await supabase
      .from('song_era')
      .select('video_id, era')
      .in('video_id', videoIds);
    if (eraError && eraError.code !== '42P01') {
      console.error('[room-playback-history GET] song_era', eraError);
    }
    if (!eraError && eraRows?.length) {
      const eraMap = new Map(eraRows.map((r) => [r.video_id, r.era]));
      items = items.map((row) => {
        const e = eraMap.get(row.video_id);
        return {
          ...row,
          era: typeof e === 'string' && e.trim() ? e.trim() : null,
        };
      });
    }
  }

  const res = NextResponse.json({ items });
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res;
}

/**
 * POST: 視聴履歴に1件追加（曲が流れてから約10秒後にクライアントから呼ぶ想定）
 * Body: { roomId, videoId, displayName, isGuest, selectionRound?: number }
 * - 同じ人・同じ曲が2分以内なら同一扱いで挿入しない
 * - ゲストは display_name を "ニックネーム (G)" 形式で保存
 * - 邦楽と判定され、かつ部屋で「邦楽解禁」が有効でない場合（公式チャ例外もなし）は挿入せず skipped: jp_domestic
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  let body: {
    roomId?: string;
    videoId?: string;
    displayName?: string;
    isGuest?: boolean;
    selectionRound?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
  const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const isGuest = Boolean(body?.isGuest);
  const selectionRound = parseSelectionRoundForHistory(body?.selectionRound);

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

  /** announce-song と同様に常に snippet を取り、概要欄の performing 行で順序を揃える */
  const snippet = await getVideoSnippet(videoId, {
    roomId,
    source: 'api/room-playback-history',
  });
  let snippetDescription =
    snippet?.description && snippet.description.trim() ? snippet.description : null;

  const resolved = await resolveArtistSongForPackAsync(title ?? videoId, authorName, snippet, videoId);
  if (process.env.DEBUG_YT_ARTIST === '1') {
    console.info('[room-playback-history POST] resolved', {
      videoId,
      oembedTitle: title?.slice(0, 120),
      authorName,
      artistDisplay: resolved.artistDisplay,
      song: resolved.song,
    });
  }
  let { artist, artistDisplay, song } = resolved;

  /** announce-song の邦楽判定と同じ。邦楽かつ未解禁（公式チャ例外なし）なら視聴履歴に載せない */
  const isJapaneseDomestic = await resolveJapaneseEconomyWithMusicBrainz({
    title: title ?? videoId,
    artistDisplay,
    artist,
    song,
    description: snippetDescription,
    channelTitle: snippet?.channelTitle ?? null,
    defaultAudioLanguage: snippet?.defaultAudioLanguage ?? null,
  });
  const jpOfficialChannelException = isJpDomesticOfficialChannelAiException(snippet?.channelId);
  const jpAiUnlockEnabled = await isRoomJpAiUnlockEnabled(roomId);
  const skipHistoryForJpDomestic =
    isJapaneseDomestic && !jpOfficialChannelException && !jpAiUnlockEnabled;
  if (skipHistoryForJpDomestic) {
    return NextResponse.json({ ok: true, skipped: 'jp_domestic' });
  }

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
    const snippetForArtist =
      snippet ??
      (await getVideoSnippet(videoId, {
        roomId,
        source: 'api/room-playback-history',
      }));
    if (snippetForArtist?.description) {
      if (!snippetDescription) snippetDescription = snippetForArtist.description;
      const fromDesc = parseArtistTitleFromDescription(snippetForArtist.description);
      if (fromDesc && !isGarbageArtistSongParse(fromDesc)) {
        artist = getMainArtist(fromDesc.artist);
        song = refineSongTitleWithDescription(fromDesc.song, snippetForArtist.description);
      } else if (
        snippetForArtist.channelTitle &&
        !isLikelyPersonalChannelName(snippetForArtist.channelTitle.trim())
      ) {
        artist = cleanAuthor(snippetForArtist.channelTitle.trim()) || snippetForArtist.channelTitle.trim();
      }
      if (!title && snippetForArtist.title) title = snippetForArtist.title;
    }
  }

  /** 一覧・スタイル変更モーダル用。oEmbed 生タイトルが「曲名 - アーティスト」のまま残らないようにする */
  const titleForDb =
    artistDisplay && song
      ? `${artistDisplay} - ${song}`
      : formatArtistTitle(title ?? videoId, authorName ?? undefined, snippetDescription) ||
        (title ?? videoId);

  let style: string | null = null;
  try {
    style = await getOrAssignStyle(
      supabase,
      videoId,
      song ?? title ?? videoId,
      artist,
      title,
      { roomId, videoId }
    );
    if (style && songId) {
      await updateSongStyle(supabase, songId, style);
    }
  } catch (e) {
    console.error('[room-playback-history] getOrAssignStyle', e);
  }

  try {
    await getOrAssignEra(supabase, videoId, {
      songTitle: (song ?? title ?? videoId) as string,
      artistName: artist,
      oembedTitle: title,
      description: snippetDescription,
    }, { roomId, videoId });
  } catch (e) {
    console.error('[room-playback-history] getOrAssignEra', e);
  }

  const insertPlayback: Record<string, unknown> = {
    room_id: roomId,
    video_id: videoId,
    display_name: displayNameToStore,
    is_guest: isGuest,
    user_id: userId,
    title: titleForDb,
    artist_name: artist ?? effectiveAuthor ?? null,
    style,
  };
  if (selectionRound != null) {
    insertPlayback.selection_round = selectionRound;
  }

  const { error } = await supabase.from('room_playback_history').insert(insertPlayback);

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
  let updateClient = admin ?? supabase;
  let { data: updated, error } = await updateClient
    .from('room_playback_history')
    .update({ style })
    .eq('id', id)
    .select('id, style');

  // Vercel 等で SUPABASE_SERVICE_ROLE_KEY が誤っていると Invalid API key になる。セッション用クライアントで再試行。
  if (
    error &&
    admin &&
    error.message?.toLowerCase().includes('invalid api key')
  ) {
    console.warn('[room-playback-history PATCH] service role key rejected; retrying with session client');
    const second = await supabase
      .from('room_playback_history')
      .update({ style })
      .eq('id', id)
      .select('id, style');
    updated = second.data;
    error = second.error;
  }

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
    return NextResponse.json(
      { error: friendlySupabaseErrorMessage(error.message) },
      { status: 500 }
    );
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
