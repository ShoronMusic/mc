import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type SessionPart = 'part1' | 'part2';

function nowJstSession(): { dateJst: string; sessionPart: SessionPart; startIso: string; endIso: string } {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jstNow.getUTCFullYear();
  const m = String(jstNow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jstNow.getUTCDate()).padStart(2, '0');
  const hh = jstNow.getUTCHours();
  const dateJst = `${y}-${m}-${d}`;

  if (hh >= 6 && hh < 18) {
    const start = new Date(`${dateJst}T06:00:00+09:00`);
    const end = new Date(`${dateJst}T18:00:00+09:00`);
    return { dateJst, sessionPart: 'part1', startIso: start.toISOString(), endIso: end.toISOString() };
  }
  if (hh >= 18) {
    const start = new Date(`${dateJst}T18:00:00+09:00`);
    const end = new Date(start.getTime() + 12 * 60 * 60 * 1000);
    return { dateJst, sessionPart: 'part2', startIso: start.toISOString(), endIso: end.toISOString() };
  }
  // 00:00-05:59 は前日 part2 に含める
  const prev = new Date(jstNow.getTime() - 24 * 60 * 60 * 1000);
  const py = prev.getUTCFullYear();
  const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(prev.getUTCDate()).padStart(2, '0');
  const prevDateJst = `${py}-${pm}-${pd}`;
  const start = new Date(`${prevDateJst}T18:00:00+09:00`);
  const end = new Date(start.getTime() + 12 * 60 * 60 * 1000);
  return { dateJst: prevDateJst, sessionPart: 'part2', startIso: start.toISOString(), endIso: end.toISOString() };
}

function fmtJstHm(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function normalizeParticipantName(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s*\(G\)\s*$/i, '').trim();
}

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId')?.trim() ?? '';
  if (!roomId) return NextResponse.json({ error: 'roomId is required' }, { status: 400 });

  const session = nowJstSession();
  const nowIso = new Date().toISOString();
  const endIso = nowIso < session.endIso ? nowIso : session.endIso;

  const { data: playData, error: playErr } = await supabase
    .from('room_playback_history')
    .select('played_at, display_name, video_id, artist_name, title, style')
    .eq('room_id', roomId)
    .gte('played_at', session.startIso)
    .lt('played_at', endIso)
    .order('played_at', { ascending: true })
    .limit(2000);
  if (playErr) return NextResponse.json({ error: playErr.message }, { status: 500 });

  const { data: liveGathering, error: liveErr } = await supabase
    .from('room_gatherings')
    .select('id')
    .eq('room_id', roomId)
    .eq('status', 'live')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (liveErr && liveErr.code !== '42P01') {
    return NextResponse.json({ error: liveErr.message }, { status: 500 });
  }

  let chatQuery = supabase
    .from('room_chat_log')
    .select('created_at, message_type, display_name')
    .eq('room_id', roomId)
    .gte('created_at', session.startIso)
    .lt('created_at', endIso);
  if (liveGathering?.id) {
    chatQuery = chatQuery.eq('gathering_id', liveGathering.id);
  }
  const { data: chatData, error: chatErr } = await chatQuery
    .order('created_at', { ascending: true })
    .limit(5000);
  if (chatErr && chatErr.code !== '42P01') return NextResponse.json({ error: chatErr.message }, { status: 500 });

  const plays = (playData ?? []) as Array<{
    played_at: string;
    display_name: string;
    video_id: string;
    artist_name: string | null;
    title: string | null;
    style: string | null;
  }>;
  const chats = (chatData ?? []) as Array<{ created_at: string; message_type: string; display_name: string }>;

  const allTimes: string[] = [];
  chats.forEach((c) => allTimes.push(c.created_at));
  plays.forEach((p) => allTimes.push(p.played_at));
  allTimes.sort();
  const activeFromAt = allTimes[0] ?? session.startIso;
  const activeToAt = allTimes[allTimes.length - 1] ?? session.startIso;

  const participantsSet = new Set<string>();
  chats.forEach((c) => {
    if (c.message_type === 'user') {
      const n = normalizeParticipantName(c.display_name);
      if (n) participantsSet.add(n);
    }
  });
  plays.forEach((p) => {
    const n = normalizeParticipantName(p.display_name);
    if (n) participantsSet.add(n);
  });
  const participants = Array.from(participantsSet);

  const byParticipant = new Map<string, number>();
  const byArtist = new Map<string, number>();
  const byStyle = new Map<string, number>();
  const byEra = new Map<string, number>();
  const byTrack = new Map<string, { artist: string; title: string; count: number }>();
  const videoIds = Array.from(new Set(plays.map((p) => p.video_id).filter(Boolean)));
  const eraByVideo = new Map<string, string>();
  if (videoIds.length > 0) {
    const { data: eraData, error: eraErr } = await supabase
      .from('song_era')
      .select('video_id, era')
      .in('video_id', videoIds);
    if (!eraErr && eraData?.length) {
      (eraData as Array<{ video_id: string; era: string | null }>).forEach((e) => {
        if (e.video_id && e.era) eraByVideo.set(e.video_id, e.era);
      });
    }
  }
  plays.forEach((p) => {
    const person = normalizeParticipantName(p.display_name) || '不明';
    byParticipant.set(person, (byParticipant.get(person) ?? 0) + 1);

    const artist = (p.artist_name ?? '不明アーティスト').trim() || '不明アーティスト';
    byArtist.set(artist, (byArtist.get(artist) ?? 0) + 1);

    const style = (p.style ?? 'Other').trim() || 'Other';
    byStyle.set(style, (byStyle.get(style) ?? 0) + 1);
    const era = (eraByVideo.get(p.video_id) ?? 'Other').trim() || 'Other';
    byEra.set(era, (byEra.get(era) ?? 0) + 1);

    const title = (p.title ?? p.video_id).trim();
    const key = `${artist}\t${title}`;
    const prev = byTrack.get(key);
    if (prev) prev.count += 1;
    else byTrack.set(key, { artist, title, count: 1 });
  });

  const participantSongCounts = Array.from(byParticipant.entries())
    .map(([displayName, count]) => ({ displayName, count }))
    .sort((a, b) => b.count - a.count);
  const popularArtists = Array.from(byArtist.entries())
    .map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const styleDistribution = Array.from(byStyle.entries())
    .map(([style, count]) => ({ style, count }))
    .sort((a, b) => b.count - a.count);
  const eraDistribution = Array.from(byEra.entries())
    .map(([era, count]) => ({ era, count }))
    .sort((a, b) => b.count - a.count);
  const popularTracks = Array.from(byTrack.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const summaryText =
    `ここまでの流れは、${session.sessionPart === 'part1' ? '第1部（06:00-18:00）' : '第2部（18:00-翌06:00）'}で` +
    `、実利用時間は ${fmtJstHm(activeFromAt)}〜${fmtJstHm(activeToAt)} です。` +
    `参加者は ${participants.join('、') || 'なし'}。` +
    `選曲は ${participantSongCounts.map((v) => `${v.displayName}(${v.count})`).join(' / ') || 'まだなし'}。` +
    `人気アーティストは ${popularArtists.map((v) => v.artist).join('、') || 'まだなし'} です。`;

  const activeUsageTimeLabel = `${fmtJstHm(activeFromAt)}〜${fmtJstHm(activeToAt)}`;

  return NextResponse.json({
    roomId,
    dateJst: session.dateJst,
    sessionPart: session.sessionPart,
    sessionWindowLabel: session.sessionPart === 'part1' ? '第1部 06:00-18:00' : '第2部 18:00-翌06:00',
    activeUsageTimeLabel,
    activeFromAt,
    activeToAt,
    participants,
    participantSongCounts,
    eraDistribution,
    styleDistribution,
    popularArtists,
    popularTracks,
    summaryText,
  });
}

