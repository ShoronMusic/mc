import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  buildSongLookupExportText,
  extractLiveCommentariesFromLog,
  extractQuizMarkersFromLog,
  extractYoutubeVideoIdFromQuery,
  filterAtPairsByPlayWindows,
  jstDayRangeUtc,
  jstYmdFromIso,
  mergeLibraryComments,
  SONG_LOOKUP_COMMENT_SOURCES,
  type AtQaPairWithRoom,
  type SongLookupDateBlock,
  type SongLookupLibraryComment,
  type SongLookupRecommendRow,
} from '@/lib/admin-song-lookup';
import { buildAtChatPairsFromLogRows, type RoomChatLogRow } from '@/lib/room-chat-at-qa-from-log';

export const dynamic = 'force-dynamic';

const MAX_PLAYBACK_ROWS = 200;
const MAX_ROOM_DAY_KEYS = 28;
const MAX_CHAT_ROWS_PER_DAY = 8000;
const LIVE_COMMENTARY_PER_ROOM_DAY = 8;
const QUIZ_MARKERS_PER_ROOM_DAY = 12;
const LIVE_COMMENTARY_PER_DATE_CAP = 5;
const AT_QA_PER_DATE_CAP = 40;
const QUIZ_MARKERS_PER_DATE_CAP = 15;
const MAX_RECOMMEND_ROWS = 80;

async function resolveVideoIdAndLabel(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  qRaw: string,
): Promise<{ videoId: string; displayLabel: string } | { error: string }> {
  const q = qRaw.trim();
  if (!q) return { error: 'q（検索キー）が空です。' };

  const fromYt = extractYoutubeVideoIdFromQuery(q);
  if (fromYt) {
    return { videoId: fromYt, displayLabel: fromYt };
  }

  const escaped = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
  const like = `%${escaped}%`;
  const { data: songs, error } = await admin
    .from('songs')
    .select('id, display_title')
    .or(`display_title.ilike.${like},main_artist.ilike.${like},song_title.ilike.${like}`)
    .order('display_title', { ascending: true })
    .limit(40);

  if (error && error.code !== '42P01') {
    console.error('[admin/song-lookup] songs', error);
    return { error: error.message };
  }
  const songList = Array.isArray(songs) ? songs : [];
  if (songList.length === 0) {
    return { error: 'songs テーブルに一致がありません。YouTube の video ID か「アーティスト - タイトル」に近い表記で試してください。' };
  }

  const ids = songList.map((s: { id: string }) => s.id).filter(Boolean);
  const { data: svRows } = await admin.from('song_videos').select('video_id, song_id').in('song_id', ids).limit(1);
  const first = Array.isArray(svRows) && svRows[0] ? (svRows[0] as { video_id: string; song_id: string }) : null;
  if (!first?.video_id) {
    return { error: '該当する song_videos（動画）がありません。' };
  }
  const songMeta = songList.find((s: { id: string }) => s.id === first.song_id) as { display_title: string | null } | undefined;
  const label = (songMeta?.display_title ?? '').trim() || first.video_id;
  return { videoId: first.video_id.trim(), displayLabel: label };
}

export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') || '120', 10) || 120));

  const resolved = await resolveVideoIdAndLabel(admin, q);
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  const { videoId, displayLabel: labelFromResolve } = resolved;
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

  const warnings: string[] = [
    '曲クイズの設問・選択肢・正解は room_chat_log に保存されていないため、出題システム行の時刻のみ取得します。',
    '曲解説のチャット抽出は「当該 video を含むユーザー投稿の直後付近の [NEW]/[DB] AI 行」＋視聴履歴の時刻窓に基づく推定です。',
  ];

  let displayLabel = labelFromResolve;

  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();

  let libraryComments: SongLookupLibraryComment[] = [];
  try {
    const { data: sc } = await admin
      .from('song_commentary')
      .select('body, created_at')
      .eq('video_id', videoId)
      .maybeSingle();
    const songCommentary =
      sc && typeof (sc as { body?: string }).body === 'string'
        ? { body: (sc as { body: string }).body, created_at: String((sc as { created_at: string }).created_at ?? '') }
        : null;

    const { data: tidRows, error: tidErr } = await admin
      .from('song_tidbits')
      .select('source, body, created_at')
      .eq('video_id', videoId)
      .in('source', [...SONG_LOOKUP_COMMENT_SOURCES])
      .order('created_at', { ascending: false })
      .limit(40);

    if (tidErr && tidErr.code !== '42P01') {
      console.warn('[admin/song-lookup] song_tidbits', tidErr.message);
    }
    const tidbits = (Array.isArray(tidRows) ? tidRows : []) as { source: string; body: string; created_at: string }[];
    libraryComments = mergeLibraryComments({ songCommentary, tidbits, max: 5 });
  } catch (e) {
    console.warn('[admin/song-lookup] library block', e);
  }

  let recommendations: SongLookupRecommendRow[] = [];
  try {
    const { data: recData, error: recErr } = await admin
      .from('next_song_recommendations')
      .select(
        'id, seed_label, recommended_artist, recommended_title, reason, order_index, created_at, is_active',
      )
      .eq('seed_video_id', videoId)
      .order('created_at', { ascending: false })
      .limit(MAX_RECOMMEND_ROWS);
    if (recErr && recErr.code !== '42P01') {
      console.warn('[admin/song-lookup] next_song_recommendations', recErr.message);
    }
    recommendations = (Array.isArray(recData) ? recData : []).map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ''),
      seed_label: (r.seed_label as string) ?? null,
      recommended_artist: (r.recommended_artist as string) ?? null,
      recommended_title: (r.recommended_title as string) ?? null,
      reason: (r.reason as string) ?? null,
      order_index: typeof r.order_index === 'number' ? r.order_index : null,
      created_at: String(r.created_at ?? ''),
      is_active: r.is_active === true,
    }));
  } catch (e) {
    console.warn('[admin/song-lookup] recommendations', e);
  }

  const { data: playData, error: playErr } = await admin
    .from('room_playback_history')
    .select('room_id, played_at, title, artist_name')
    .eq('video_id', videoId)
    .gte('played_at', sinceIso)
    .order('played_at', { ascending: false })
    .limit(MAX_PLAYBACK_ROWS);

  if (playErr) {
    if (playErr.code === '42P01') {
      return NextResponse.json(
        { error: 'room_playback_history テーブルがありません。', hint: 'docs/supabase-room-playback-history-table.md' },
        { status: 503 },
      );
    }
    console.error('[admin/song-lookup] room_playback_history', playErr);
    return NextResponse.json({ error: playErr.message }, { status: 500 });
  }

  const plays = (Array.isArray(playData) ? playData : []) as {
    room_id: string;
    played_at: string;
    title: string | null;
    artist_name: string | null;
  }[];

  if (plays.length > 0) {
    const latest = plays[0]!;
    const t = (latest.title ?? '').trim();
    const a = (latest.artist_name ?? '').trim();
    if (t || a) displayLabel = a && t ? `${a} - ${t}` : t || a || displayLabel;
  }

  const playsByDate = new Map<string, typeof plays>();
  for (const p of plays) {
    const d = jstYmdFromIso(p.played_at);
    const arr = playsByDate.get(d) ?? [];
    arr.push(p);
    playsByDate.set(d, arr);
  }

  const sortedDates = [...playsByDate.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  type RoomDayKey = `${string}\t${string}`;
  const roomDayKeys: RoomDayKey[] = [];
  const seenKey = new Set<string>();
  for (const dateJst of sortedDates) {
    const dayPlays = playsByDate.get(dateJst) ?? [];
    const rooms = [...new Set(dayPlays.map((x) => x.room_id).filter(Boolean))];
    for (const roomId of rooms) {
      const k = `${roomId}\t${dateJst}` as RoomDayKey;
      if (seenKey.has(k)) continue;
      seenKey.add(k);
      roomDayKeys.push(k);
    }
  }

  const keysLimited = roomDayKeys.slice(0, MAX_ROOM_DAY_KEYS);
  if (roomDayKeys.length > MAX_ROOM_DAY_KEYS) {
    warnings.push(`部屋×日の会話取得は最大 ${MAX_ROOM_DAY_KEYS} 件に制限しました（古い組み合わせは省略）。`);
  }

  const chatCache = new Map<string, RoomChatLogRow[]>();
  for (const key of keysLimited) {
    const [roomId, dateJst] = key.split('\t') as [string, string];
    const range = jstDayRangeUtc(dateJst);
    if (!range) continue;
    const { data: logData, error: logErr } = await admin
      .from('room_chat_log')
      .select('created_at, message_type, display_name, body')
      .eq('room_id', roomId)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .order('created_at', { ascending: true })
      .limit(MAX_CHAT_ROWS_PER_DAY + 1);

    if (logErr) {
      if (logErr.code !== '42P01') console.warn('[admin/song-lookup] room_chat_log', logErr.message);
      chatCache.set(key, []);
      continue;
    }
    const raw = (logData ?? []) as RoomChatLogRow[];
    chatCache.set(key, raw.length > MAX_CHAT_ROWS_PER_DAY ? raw.slice(0, MAX_CHAT_ROWS_PER_DAY) : raw);
    if (raw.length > MAX_CHAT_ROWS_PER_DAY) {
      warnings.push(`room_chat_log が1日あたり ${MAX_CHAT_ROWS_PER_DAY} 件を超えたため打ち切りました（${roomId} / ${dateJst}）。`);
    }
  }

  const dateBlocks: SongLookupDateBlock[] = [];

  for (const dateJst of sortedDates) {
    const dayPlays = [...(playsByDate.get(dateJst) ?? [])].sort(
      (a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime(),
    );

    const liveCommentaries: SongLookupDateBlock['liveCommentaries'] = [];
    const atQaPairs: AtQaPairWithRoom[] = [];
    const quizMarkers: SongLookupDateBlock['quizMarkers'] = [];

    const rooms = [...new Set(dayPlays.map((p) => p.room_id).filter(Boolean))];
    for (const roomId of rooms) {
      const cacheKey = `${roomId}\t${dateJst}` as const;
      const rows = chatCache.get(cacheKey) ?? [];
      const playsThisRoom = dayPlays.filter((p) => p.room_id === roomId);

      const pairs = buildAtChatPairsFromLogRows(rows);
      const filteredPairs = filterAtPairsByPlayWindows(pairs, playsThisRoom);
      for (const pr of filteredPairs) {
        atQaPairs.push({ ...pr, room_id: roomId });
      }

      const lc = extractLiveCommentariesFromLog(
        rows,
        videoId,
        playsThisRoom,
        roomId,
        LIVE_COMMENTARY_PER_ROOM_DAY,
      );
      liveCommentaries.push(...lc);

      const qm = extractQuizMarkersFromLog(rows, playsThisRoom, roomId, QUIZ_MARKERS_PER_ROOM_DAY);
      quizMarkers.push(...qm);
    }

    liveCommentaries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const liveDedup: typeof liveCommentaries = [];
    const seenL = new Set<string>();
    for (const x of liveCommentaries) {
      const k = `${x.room_id}\t${x.created_at}\t${x.body.slice(0, 100)}`;
      if (seenL.has(k)) continue;
      seenL.add(k);
      liveDedup.push(x);
      if (liveDedup.length >= LIVE_COMMENTARY_PER_DATE_CAP) break;
    }

    atQaPairs.sort((a, b) => new Date(b.userCreatedAt).getTime() - new Date(a.userCreatedAt).getTime());
    const atDedup = atQaPairs.slice(0, AT_QA_PER_DATE_CAP);

    quizMarkers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const quizDedup: typeof quizMarkers = [];
    const seenQ = new Set<string>();
    for (const x of quizMarkers) {
      const k = `${x.room_id}\t${x.created_at}`;
      if (seenQ.has(k)) continue;
      seenQ.add(k);
      quizDedup.push(x);
      if (quizDedup.length >= QUIZ_MARKERS_PER_DATE_CAP) break;
    }

    dateBlocks.push({
      dateJst,
      plays: dayPlays.map((p) => ({
        room_id: p.room_id,
        played_at: p.played_at,
        title: p.title,
        artist_name: p.artist_name,
      })),
      liveCommentaries: liveDedup,
      atQaPairs: atDedup,
      quizMarkers: quizDedup,
    });
  }

  const exportText = buildSongLookupExportText({
    videoId,
    displayLabel,
    watchUrl,
    warnings,
    libraryComments,
    recommendations,
    dateBlocks,
  });

  return NextResponse.json({
    videoId,
    displayLabel,
    watchUrl,
    warnings,
    libraryComments,
    recommendations,
    dateBlocks,
    exportText,
    playbackRowCount: plays.length,
    days,
  });
}
