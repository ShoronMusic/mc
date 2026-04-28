import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStyleAdminUserIds } from '@/lib/style-admin';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import {
  getArtistAndSong,
  getMainArtist,
  isGarbageArtistSongParse,
  isLikelyPersonalChannelName,
  parseArtistTitleFromDescription,
  cleanAuthor,
  refineSongTitleWithDescription,
  formatArtistTitle,
} from '@/lib/format-song-display';
import { resolveArtistSongForPackAsync } from '@/lib/youtube-artist-song-for-pack';
import { fetchMusic8SongDataForPlaybackRow } from '@/lib/music8-song-lookup';
import { extractMusic8SongFields, music8ReleaseYearMonthToPostgresDate } from '@/lib/music8-song-fields';
import { buildPersistableMusic8SongSnapshot } from '@/lib/music8-song-persist';
import { getVideoSnippet } from '@/lib/youtube-search';
import { resolveJapaneseEconomyWithMusicBrainz } from '@/lib/resolve-japanese-economy';
import { isJpDomesticOfficialChannelAiException } from '@/lib/jp-official-channel-exception';
import { isRoomJpAiUnlockEnabled } from '@/lib/room-jp-ai-unlock-server';
import { getOrAssignEra } from '@/lib/song-era';
import { getOrAssignStyle, setStyleInDb } from '@/lib/song-style';
import { upsertSongAndVideo, updateSongStyle, incrementSongPlayCount } from '@/lib/song-entities';
import {
  fetchPlaybackDisplayOverride,
  upsertPlaybackDisplayOverride,
} from '@/lib/video-playback-display-override';
import { SONG_STYLE_OPTIONS } from '@/lib/song-styles';
import type { SongStyle } from '@/lib/gemini';
import { gateRoomPlaybackHistoryRead } from '@/lib/room-playback-history-access';

export const dynamic = 'force-dynamic';

const TWO_MINUTES_MS = 2 * 60 * 1000;
/** STYLE_ADMIN が視聴履歴の「アーティスト - タイトル」行を修正するときの最大文字数 */
const PLAYBACK_TITLE_PATCH_MAX_LEN = 500;

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

function safeRoomIdPlayback(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > 48) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) return null;
  return t;
}

function safeClientIdPlaybackQuery(raw: string | null): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t || t.length > 80) return null;
  if (!/^[a-zA-Z0-9._:-]+$/.test(t)) return null;
  return t;
}

/**
 * GET: 部屋の視聴履歴一覧（played_at 降順）
 * Query: roomId, clientId（ゲストまたは参加記録同期前のフォールバック用・Ably presence 照合）,
 *        since（任意・ISO8601）— 指定時は played_at >= since の行のみ
 *
 * 閲覧は「当該部屋の未終了参加履歴があるログインユーザー」または「Ably で在室確認できた clientId」のみ。
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const roomId = safeRoomIdPlayback(searchParams.get('roomId') ?? '');
  if (!roomId) {
    return NextResponse.json({ error: 'roomId is required' }, { status: 400 });
  }

  const clientId = safeClientIdPlaybackQuery(searchParams.get('clientId'));
  const gate = await gateRoomPlaybackHistoryRead(supabase, roomId, clientId);
  if (!gate.allowed) {
    return NextResponse.json({ error: gate.reason, items: [] as RoomPlaybackHistoryRow[] }, { status: 403 });
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

  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

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

  let originalReleaseDateIso: string | null = null;
  let music8SongData: Record<string, unknown> | null = null;
  try {
    const music8Json = await fetchMusic8SongDataForPlaybackRow(
      (artist ?? effectiveAuthor ?? '').trim() || 'Unknown',
      title ?? videoId,
    );
    if (music8Json) {
      const m8 = extractMusic8SongFields(music8Json);
      if (m8.releaseDate?.trim()) {
        originalReleaseDateIso = music8ReleaseYearMonthToPostgresDate(m8.releaseDate);
      }
      music8SongData = buildPersistableMusic8SongSnapshot(music8Json);
    }
  } catch (e) {
    console.warn('[room-playback-history] music8 snapshot / release for songs', e);
  }

  let songId: string | null = null;
  try {
    songId = await upsertSongAndVideo({
      supabase,
      videoId,
      mainArtist: artist ?? effectiveAuthor ?? null,
      songTitle: song ?? (title ?? videoId),
      variant: 'official',
      youtubePublishedAtIso: snippet?.publishedAt ?? null,
      originalReleaseDateIso,
      music8SongData: music8SongData ?? undefined,
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
      : formatArtistTitle(
          title ?? videoId,
          authorName ?? undefined,
          snippetDescription,
          snippet?.channelTitle ?? null,
        ) ||
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
      publishedAtIso: snippet?.publishedAt ?? null,
    }, { roomId, videoId });
  } catch (e) {
    console.error('[room-playback-history] getOrAssignEra', e);
  }

  /** 管理者が保存した video_id 単位の表記があれば、履歴行の表示に優先 */
  let historyTitle = titleForDb;
  let historyArtistName: string | null = artist ?? effectiveAuthor ?? null;
  const overrideReader = createAdminClient() ?? supabase;
  const displayOverride = await fetchPlaybackDisplayOverride(overrideReader, videoId);
  if (displayOverride) {
    historyTitle = displayOverride.title;
    historyArtistName = displayOverride.artist_name;
  }

  const insertPlayback: Record<string, unknown> = {
    room_id: roomId,
    video_id: videoId,
    display_name: displayNameToStore,
    is_guest: isGuest,
    user_id: userId,
    title: historyTitle,
    artist_name: historyArtistName,
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
 * PATCH: 視聴履歴のスタイル・表示タイトル（アーティスト - タイトル）を修正。
 * Body: { id, videoId, style? , title? } — style と title のどちらか一方以上が必要。
 * STYLE_ADMIN_USER_IDS 未設定時は従来どおり誰でも更新可。設定時はリスト内ユーザーのみ。
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  let body: { id?: string; videoId?: string; style?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
  const styleRaw = typeof body?.style === 'string' ? body.style.trim() : '';
  const titleRaw = typeof body?.title === 'string' ? body.title.trim() : '';

  if (!id || !videoId) {
    return NextResponse.json({ error: 'id and videoId are required' }, { status: 400 });
  }

  const hasStyle = styleRaw !== '';
  const hasTitle = titleRaw !== '';
  if (!hasStyle && !hasTitle) {
    return NextResponse.json({ error: 'style または title のいずれかを指定してください。' }, { status: 400 });
  }

  if (hasStyle && !SONG_STYLE_OPTIONS.includes(styleRaw as (typeof SONG_STYLE_OPTIONS)[number])) {
    return NextResponse.json({ error: 'Invalid style' }, { status: 400 });
  }

  if (hasTitle) {
    if (titleRaw.length > PLAYBACK_TITLE_PATCH_MAX_LEN) {
      return NextResponse.json(
        { error: `title は ${PLAYBACK_TITLE_PATCH_MAX_LEN} 文字以内にしてください。` },
        { status: 400 },
      );
    }
  }

  const adminIds = getStyleAdminUserIds();
  if (adminIds.length > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uid = user?.id;
    if (!uid || !adminIds.includes(uid)) {
      return NextResponse.json(
        {
          error:
            '視聴履歴の修正は管理者のみ行えます。STYLE_ADMIN_USER_IDS に含まれるアカウントでログインしてください。',
        },
        { status: 403 },
      );
    }
  }

  const updates: Record<string, unknown> = {};
  if (hasStyle) {
    updates.style = styleRaw;
  }
  if (hasTitle) {
    updates.title = titleRaw;
    const parsed = getArtistAndSong(titleRaw, null);
    updates.artist_name =
      parsed.artistDisplay && parsed.song
        ? getMainArtist(parsed.artist ?? parsed.artistDisplay)
        : null;
  }

  let styleCacheSaved = false;
  if (hasStyle) {
    styleCacheSaved = await setStyleInDb(supabase, videoId, styleRaw as SongStyle);
  }

  const admin = createAdminClient();
  let updateClient = admin ?? supabase;
  let { data: updated, error } = await updateClient
    .from('room_playback_history')
    .update(updates)
    .eq('id', id)
    .select('id, style, title, artist_name');

  if (
    error &&
    admin &&
    error.message?.toLowerCase().includes('invalid api key')
  ) {
    console.warn('[room-playback-history PATCH] service role key rejected; retrying with session client');
    const second = await supabase
      .from('room_playback_history')
      .update(updates)
      .eq('id', id)
      .select('id, style, title, artist_name');
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
        {
          error:
            '視聴履歴の列が不足しています。docs/supabase-room-playback-history-table.md のテーブル定義を確認してください。',
        },
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
      { error: '該当する履歴が見つかりません。id を確認してください。' },
      { status: 404 }
    );
  }

  const row = updated[0] as {
    id?: string;
    style?: string | null;
    title?: string | null;
    artist_name?: string | null;
  };

  let displayOverrideSaved = false;
  if (hasTitle) {
    const service = createAdminClient();
    if (service) {
      const savedTitle =
        typeof row.title === 'string' && row.title.trim() ? row.title.trim() : titleRaw;
      const savedArtist = (updates.artist_name ?? null) as string | null;
      displayOverrideSaved = await upsertPlaybackDisplayOverride(
        service,
        videoId,
        savedTitle,
        savedArtist,
      );
    } else {
      console.warn(
        '[room-playback-history PATCH] SUPABASE_SERVICE_ROLE_KEY 未設定のため video_playback_display_override に保存できません。次回再生への反映にはサービスロールと docs/supabase-song-history-table.md のテーブル作成が必要です。',
      );
    }
  }

  return NextResponse.json({
    ok: true,
    style: row.style ?? undefined,
    title: row.title ?? undefined,
    artist_name: row.artist_name ?? undefined,
    styleCacheSaved,
    displayOverrideSaved,
  });
}
