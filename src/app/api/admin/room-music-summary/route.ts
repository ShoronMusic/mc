import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStyleAdminUserIds } from '@/lib/style-admin';

export const dynamic = 'force-dynamic';

type PlaybackRow = {
  video_id: string;
  title: string | null;
  artist_name: string | null;
  style: string | null;
  played_at: string;
};

type ChatRow = {
  body: string | null;
};

type EraRow = {
  video_id: string;
  era: string | null;
};

type TrackStat = {
  artist: string;
  title: string;
  plays: number;
  mention: number;
  score: number;
};

function normalizeText(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim();
}

function countMentions(chatBodies: string[], keyword: string): number {
  const k = normalizeText(keyword);
  if (!k || k.length < 2) return 0;
  let c = 0;
  chatBodies.forEach((b) => {
    if (b.includes(k)) c += 1;
  });
  return c;
}

async function requireAdmin() {
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 }) };

  const adminIds = getStyleAdminUserIds();
  if (adminIds.length === 0) {
    return {
      error: NextResponse.json(
        { error: 'STYLE_ADMIN_USER_IDS を .env.local に設定し、管理者アカウントでログインしてください。' },
        { status: 403 }
      ),
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) {
    return {
      error: NextResponse.json(
        {
          error:
            'ログインが確認できません。マイページからログインしてから /admin/room-music-summary を開き直してください。',
          hint: authError?.message,
        },
        { status: 403 }
      ),
    };
  }
  if (!adminIds.includes(uid)) {
    return {
      error: NextResponse.json(
        { error: 'このアカウントは STYLE_ADMIN_USER_IDS に含まれていません。' },
        { status: 403 }
      ),
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      error: NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 }),
    };
  }
  return { supabase, admin, uid };
}

async function buildSummary(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  roomId: string,
  hours: 1 | 2
) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: playData, error: playError } = await supabase
    .from('room_playback_history')
    .select('video_id, title, artist_name, style, played_at')
    .eq('room_id', roomId)
    .gte('played_at', since)
    .order('played_at', { ascending: false })
    .limit(600);
  if (playError) {
    if (playError.code === '42P01') {
      throw new Error('room_playback_history テーブルがありません。');
    }
    throw new Error(playError.message);
  }
  const plays = (playData ?? []) as PlaybackRow[];

  const { data: chatData, error: chatError } = await supabase
    .from('room_chat_log')
    .select('body')
    .eq('room_id', roomId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1500);
  if (chatError && chatError.code !== '42P01') {
    throw new Error(chatError.message);
  }
  const chatBodies = ((chatData ?? []) as ChatRow[])
    .map((r) => normalizeText(r.body))
    .filter(Boolean);

  const styleCount = new Map<string, number>();
  const artistCount = new Map<string, number>();
  const trackMap = new Map<string, { artist: string; title: string; plays: number; mention: number }>();

  plays.forEach((p) => {
    const artist = (p.artist_name ?? '不明アーティスト').trim();
    const title = (p.title ?? p.video_id).trim();
    const style = (p.style ?? 'Other').trim() || 'Other';
    styleCount.set(style, (styleCount.get(style) ?? 0) + 1);
    artistCount.set(artist, (artistCount.get(artist) ?? 0) + 1);

    const prev = trackMap.get(p.video_id);
    if (prev) {
      prev.plays += 1;
    } else {
      trackMap.set(p.video_id, { artist, title, plays: 1, mention: 0 });
    }
  });

  trackMap.forEach((t) => {
    const artistM = countMentions(chatBodies, t.artist);
    const titleM = countMentions(chatBodies, t.title.slice(0, 64));
    t.mention = artistM + titleM;
  });

  const videoIds = Array.from(new Set(plays.map((p) => p.video_id).filter(Boolean)));
  const eraCount = new Map<string, number>();
  if (videoIds.length > 0) {
    const { data: eraData, error: eraError } = await supabase
      .from('song_era')
      .select('video_id, era')
      .in('video_id', videoIds);
    if (!eraError && eraData?.length) {
      const eraByVideo = new Map<string, string>();
      (eraData as EraRow[]).forEach((e) => {
        if (e.video_id && e.era) eraByVideo.set(e.video_id, e.era);
      });
      plays.forEach((p) => {
        const era = eraByVideo.get(p.video_id) ?? 'Other';
        eraCount.set(era, (eraCount.get(era) ?? 0) + 1);
      });
    }
  }

  const topStyles = Array.from(styleCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  const topEras = Array.from(eraCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  const topArtists = Array.from(artistCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);
  const topTracks: TrackStat[] = Array.from(trackMap.values())
    .map((t) => ({ ...t, score: t.plays * 3 + t.mention }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const summaryText =
    plays.length === 0
      ? `直近${hours}時間の再生履歴はまだ少なく、傾向判定は保留です。`
      : `直近${hours}時間は、${topStyles.slice(0, 2).join('・') || 'スタイル混在'}寄り、年代は${topEras.slice(0, 2).join('・') || '判定中'}が中心です。人気曲は ${topTracks
          .slice(0, 2)
          .map((t) => `${t.artist} - ${t.title}`)
          .join(' / ') || 'まだ偏りなし'}。アーティストでは ${topArtists.slice(0, 3).join('、') || 'まだ偏りなし'} が多く話題になっています。`;

  return {
    roomId,
    windowHours: hours,
    windowStartAt: since,
    windowEndAt: now,
    totalPlays: plays.length,
    totalMessages: chatBodies.length,
    topStyles,
    topEras,
    topArtists,
    topTracks,
    summaryText,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { admin } = auth;

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId')?.trim() ?? '';
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50) || 50));

  let query = admin
    .from('room_music_summary')
    .select(
      'id, room_id, window_hours, window_start_at, window_end_at, total_plays, total_messages, top_styles, top_eras, top_artists, top_tracks, summary_text, created_by_user_id, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (roomId) query = query.eq('room_id', roomId);

  const { data, error } = await query;
  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: 'room_music_summary テーブルがありません。',
          hint: 'docs/supabase-room-music-summary-table.md の SQL を実行してください。',
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { admin, supabase, uid } = auth;

  let body: { roomId?: string; hours?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
  const hoursRaw = Number(body?.hours ?? 2);
  const hours: 1 | 2 = hoursRaw === 1 ? 1 : 2;
  if (!roomId) {
    return NextResponse.json({ error: 'roomId is required' }, { status: 400 });
  }

  let summary;
  try {
    summary = await buildSummary(supabase, roomId, hours);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'summary generation failed' },
      { status: 500 }
    );
  }

  const { data, error } = await admin
    .from('room_music_summary')
    .insert({
      room_id: summary.roomId,
      window_hours: summary.windowHours,
      window_start_at: summary.windowStartAt,
      window_end_at: summary.windowEndAt,
      total_plays: summary.totalPlays,
      total_messages: summary.totalMessages,
      top_styles: summary.topStyles,
      top_eras: summary.topEras,
      top_artists: summary.topArtists,
      top_tracks: summary.topTracks,
      summary_text: summary.summaryText,
      created_by_user_id: uid,
    })
    .select(
      'id, room_id, window_hours, window_start_at, window_end_at, total_plays, total_messages, top_styles, top_eras, top_artists, top_tracks, summary_text, created_by_user_id, created_at'
    )
    .single();

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: 'room_music_summary テーブルがありません。',
          hint: 'docs/supabase-room-music-summary-table.md の SQL を実行してください。',
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, item: data });
}

