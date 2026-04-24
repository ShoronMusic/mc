import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  buildSongReportExportText,
  extractYoutubeVideoIdFromQuery,
  filterAtPairsByPlayWindows,
  groupNextSongRecommendationsIntoRounds,
  jstDayRangeUtc,
  jstYmdFromIso,
  splitDisplayTitle,
  type AtQaPairWithRoom,
  type RoomChatLogRow,
  type SongAdminReport,
  type SongReportAtRow,
  type SongReportCommentaryDb,
  type SongReportQuizDb,
  type SongReportSelectionRow,
} from '@/lib/admin-song-lookup';
import { buildAtChatPairsFromLogRows } from '@/lib/room-chat-at-qa-from-log';
import { coerceSongQuizCorrectIndex, isValidSongQuizPayload } from '@/lib/song-quiz-types';

export const dynamic = 'force-dynamic';

const MAX_PLAYBACK_ROWS = 400;
const MAX_ROOM_DAY_KEYS = 40;
const MAX_CHAT_ROWS_PER_DAY = 8000;
const AT_QA_FLAT_CAP = 120;
const MAX_QUIZ_LOG_ROWS = 200;
const MAX_RECOMMEND_ROWS = 200;

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

function parseQuizFromRow(raw: unknown): SongReportQuizDb['quiz'] | null {
  if (!isValidSongQuizPayload(raw)) return null;
  const q = raw;
  return {
    question: q.question.trim(),
    choices: q.choices as [string, string, string],
    correctIndex: coerceSongQuizCorrectIndex(q.correctIndex),
    explanation: String(q.explanation).trim(),
    ...(q.theme ? { theme: q.theme } : {}),
  };
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
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();

  const warnings: string[] = [];

  let artist = '';
  let songTitle = '';
  let displayTitle = labelFromResolve;

  const { data: svOne } = await admin.from('song_videos').select('song_id').eq('video_id', videoId).maybeSingle();
  const songId = (svOne as { song_id?: string } | null)?.song_id?.trim();
  if (songId) {
    const { data: songRow } = await admin
      .from('songs')
      .select('main_artist, song_title, display_title')
      .eq('id', songId)
      .maybeSingle();
    if (songRow) {
      const sr = songRow as { main_artist: string | null; song_title: string | null; display_title: string | null };
      artist = (sr.main_artist ?? '').trim();
      songTitle = (sr.song_title ?? '').trim();
      const dt = (sr.display_title ?? '').trim();
      if (dt) displayTitle = dt;
      if (!artist || !songTitle) {
        const sp = splitDisplayTitle(dt || displayTitle);
        if (!artist) artist = sp.artist;
        if (!songTitle) songTitle = sp.songTitle;
      }
    }
  }

  let commentaryDb: SongReportCommentaryDb | null = null;
  try {
    const { data: sc } = await admin
      .from('song_commentary')
      .select('body, created_at')
      .eq('video_id', videoId)
      .maybeSingle();
    if (sc && typeof (sc as { body?: string }).body === 'string' && (sc as { body: string }).body.trim()) {
      commentaryDb = {
        body: (sc as { body: string }).body.trim(),
        source: 'song_commentary',
        updated_at: String((sc as { created_at: string }).created_at ?? ''),
      };
    } else {
      const { data: tidOne } = await admin
        .from('song_tidbits')
        .select('body, created_at')
        .eq('video_id', videoId)
        .eq('source', 'ai_commentary')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (tidOne && typeof (tidOne as { body?: string }).body === 'string' && (tidOne as { body: string }).body.trim()) {
        commentaryDb = {
          body: (tidOne as { body: string }).body.trim(),
          source: 'song_tidbits:ai_commentary',
          updated_at: String((tidOne as { created_at: string }).created_at ?? ''),
        };
      }
    }
  } catch {
    /* noop */
  }

  const { data: playData, error: playErr } = await admin
    .from('room_playback_history')
    .select('room_id, played_at, title, artist_name, display_name')
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
    display_name: string | null;
  }[];

  if (!artist && !songTitle && plays[0]) {
    const sp = splitDisplayTitle((plays[0].title ?? '').trim());
    artist = sp.artist;
    songTitle = sp.songTitle;
    if (!displayTitle || displayTitle === videoId) {
      displayTitle = [plays[0].artist_name, plays[0].title].filter(Boolean).join(' - ').trim() || displayTitle;
    }
  }

  const roomIds = [...new Set(plays.map((p) => p.room_id).filter(Boolean))];
  const roomTitleMap = new Map<string, string>();
  if (roomIds.length > 0) {
    const { data: lobbyRows, error: lobbyErr } = await admin
      .from('room_lobby_message')
      .select('room_id, display_title')
      .in('room_id', roomIds);
    if (!lobbyErr && Array.isArray(lobbyRows)) {
      for (const row of lobbyRows as { room_id: string; display_title: string | null }[]) {
        const rid = (row.room_id ?? '').trim();
        if (!rid) continue;
        const t = (row.display_title ?? '').trim();
        roomTitleMap.set(rid, t || rid);
      }
    }
  }

  const selectionHistory: SongReportSelectionRow[] = plays.map((p) => ({
    played_at: p.played_at,
    date_jst: jstYmdFromIso(p.played_at),
    room_id: p.room_id,
    room_display_title: roomTitleMap.get(p.room_id) ?? p.room_id,
    selector_display_name: (p.display_name ?? '').trim() || '—',
    snapshot_title: p.title,
    snapshot_artist: p.artist_name,
  }));

  let quizzesDb: SongReportQuizDb[] = [];
  const { data: qzRows, error: qzErr } = await admin
    .from('song_quiz_logs')
    .select('id, created_at, room_id, commentary_context_sha256, commentary_context_preview, quiz')
    .eq('video_id', videoId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(MAX_QUIZ_LOG_ROWS);

  if (qzErr) {
    if (qzErr.code === '42P01') {
      warnings.push('song_quiz_logs テーブルがありません。docs/supabase-setup.md 第20章の SQL を実行すると、以降のクイズが保存・表示されます。');
    } else {
      console.warn('[admin/song-lookup] song_quiz_logs', qzErr.message);
    }
  } else {
    for (const raw of Array.isArray(qzRows) ? qzRows : []) {
      const o = raw as Record<string, unknown>;
      const id = String(o.id ?? '');
      const created_at = String(o.created_at ?? '');
      const quizParsed = parseQuizFromRow(o.quiz);
      if (!id || !created_at || !quizParsed) continue;
      quizzesDb.push({
        id,
        created_at,
        date_jst: jstYmdFromIso(created_at),
        room_id: typeof o.room_id === 'string' ? o.room_id.trim() || null : null,
        commentary_sha: typeof o.commentary_context_sha256 === 'string' ? o.commentary_context_sha256 : null,
        commentary_preview: typeof o.commentary_context_preview === 'string' ? o.commentary_context_preview : null,
        quiz: quizParsed,
      });
    }
  }

  let recommendationRounds: ReturnType<typeof groupNextSongRecommendationsIntoRounds> = [];
  try {
    const { data: recData, error: recErr } = await admin
      .from('next_song_recommendations')
      .select(
        'created_at, recommended_artist, recommended_title, reason, order_index, is_active',
      )
      .eq('seed_video_id', videoId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(MAX_RECOMMEND_ROWS);
    if (recErr && recErr.code !== '42P01') {
      console.warn('[admin/song-lookup] next_song_recommendations', recErr.message);
    } else {
      recommendationRounds = groupNextSongRecommendationsIntoRounds(Array.isArray(recData) ? recData : [], 3);
    }
  } catch {
    /* noop */
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
    warnings.push(`@ 質問用の会話取得は部屋×日で最大 ${MAX_ROOM_DAY_KEYS} 件に制限しました。`);
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
  }

  const atFlat: AtQaPairWithRoom[] = [];
  for (const dateJst of sortedDates) {
    const dayPlays = playsByDate.get(dateJst) ?? [];
    const rooms = [...new Set(dayPlays.map((p) => p.room_id).filter(Boolean))];
    for (const roomId of rooms) {
      const cacheKey = `${roomId}\t${dateJst}` as const;
      const rows = chatCache.get(cacheKey) ?? [];
      const playsThisRoom = dayPlays.filter((p) => p.room_id === roomId);
      const pairs = buildAtChatPairsFromLogRows(rows);
      const filtered = filterAtPairsByPlayWindows(pairs, playsThisRoom);
      for (const pr of filtered) {
        atFlat.push({ ...pr, room_id: roomId });
      }
    }
  }
  atFlat.sort((a, b) => new Date(b.userCreatedAt).getTime() - new Date(a.userCreatedAt).getTime());
  const atDedup: SongReportAtRow[] = [];
  const seenAt = new Set<string>();
  for (const p of atFlat) {
    const k = `${p.room_id}\t${p.userCreatedAt}\t${p.userBody.slice(0, 80)}`;
    if (seenAt.has(k)) continue;
    seenAt.add(k);
    atDedup.push({
      date_jst: jstYmdFromIso(p.userCreatedAt),
      user_created_at: p.userCreatedAt,
      ai_created_at: p.aiCreatedAt,
      room_id: p.room_id,
      room_display_title: roomTitleMap.get(p.room_id) ?? p.room_id,
      questioner: p.userDisplayName,
      question: p.userBody,
      answer: p.aiBody,
    });
    if (atDedup.length >= AT_QA_FLAT_CAP) break;
  }

  const report: SongAdminReport = {
    videoId,
    artist,
    songTitle,
    displayTitle,
    watchUrl,
    commentaryDb,
    selectionHistory,
    quizzesDb,
    recommendationRounds,
    atQuestions: atDedup,
    warnings,
  };

  const exportText = buildSongReportExportText(report);

  return NextResponse.json({
    ...report,
    exportText,
    playbackRowCount: plays.length,
    days,
  });
}
