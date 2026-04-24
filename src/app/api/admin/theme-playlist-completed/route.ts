import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStyleAdminUserIds } from '@/lib/style-admin';

export const dynamic = 'force-dynamic';

type MissionRow = {
  id: string;
  theme_id: string;
  created_at: string;
  completed_at: string | null;
  room_id: string | null;
  room_title: string | null;
  room_owner_user_id: string | null;
};

type EntryRow = {
  mission_id: string;
  slot_index: number;
  title: string | null;
  artist: string | null;
  video_id: string;
  selector_display_name: string | null;
  ai_comment: string | null;
  ai_overall_comment: string | null;
};

function toSafeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t ? t : null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }
  const adminIds = getStyleAdminUserIds();
  if (adminIds.length === 0) {
    return NextResponse.json({ error: 'STYLE_ADMIN_USER_IDS を設定してください。' }, { status: 403 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id || !adminIds.includes(user.id)) {
    return NextResponse.json({ error: '管理者権限がありません。' }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const sp = new URL(request.url).searchParams;
  const days = Math.min(180, Math.max(1, Number.parseInt(sp.get('days') || '30', 10) || 30));
  const limit = Math.min(120, Math.max(1, Number.parseInt(sp.get('limit') || '40', 10) || 40));
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();

  const { data: missionsRaw, error: mErr } = await admin
    .from('user_theme_playlist_missions')
    .select('id, theme_id, created_at, completed_at, room_id, room_title, room_owner_user_id')
    .eq('status', 'completed')
    .gte('completed_at', sinceIso)
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (mErr) {
    if (mErr.code === '42P01') {
      return NextResponse.json(
        { error: 'お題ミッションのテーブルが未作成です。docs/supabase-setup.md 第18章を実行してください。' },
        { status: 503 },
      );
    }
    if (mErr.code === '42703') {
      return NextResponse.json(
        {
          error:
            'お題ミッションの列が不足しています。docs/supabase-setup.md 第18章の追補SQL（room_id / room_title / room_owner_user_id）を実行してください。',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }
  const missions = (missionsRaw ?? []) as MissionRow[];
  const missionIds = missions.map((m) => m.id);
  if (missionIds.length === 0) {
    return NextResponse.json({ days, rows: [] });
  }

  const { data: entriesRaw, error: eErr } = await admin
    .from('user_theme_playlist_entries')
    .select('mission_id, slot_index, title, artist, video_id, selector_display_name, ai_comment, ai_overall_comment')
    .in('mission_id', missionIds)
    .order('slot_index', { ascending: true });
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
  const byMission = new Map<string, EntryRow[]>();
  for (const e of (entriesRaw ?? []) as EntryRow[]) {
    const list = byMission.get(e.mission_id) ?? [];
    list.push(e);
    byMission.set(e.mission_id, list);
  }

  const ownerUserIds = Array.from(new Set(missions.map((m) => (m.room_owner_user_id || '').trim()).filter(Boolean)));
  const ownerDisplayByUserId = new Map<string, string>();
  if (ownerUserIds.length > 0) {
    const { data: ownerNames } = await admin
      .from('user_room_participation_history')
      .select('user_id, room_id, display_name, joined_at')
      .in('user_id', ownerUserIds)
      .order('joined_at', { ascending: false })
      .limit(5000);
    for (const row of ownerNames ?? []) {
      const userId = typeof row.user_id === 'string' ? row.user_id : '';
      if (!userId || ownerDisplayByUserId.has(userId)) continue;
      const dn = toSafeName(row.display_name);
      if (dn) ownerDisplayByUserId.set(userId, dn);
    }
  }

  const rows = [] as Array<{
    mission_id: string;
    completed_at: string;
    theme_id: string;
    room_id: string | null;
    room_title: string | null;
    owner: string | null;
    participants: string[];
    songs: Array<{ slot_index: number; label: string; selector: string | null; ai_comment: string | null }>;
  }>;

  for (const m of missions) {
    const entries = byMission.get(m.id) ?? [];
    const songs = entries.map((e) => ({
      slot_index: e.slot_index,
      label: `${(e.artist || '').trim() || '—'} - ${(e.title || '').trim() || e.video_id}`,
      selector: toSafeName(e.selector_display_name),
      ai_comment: toSafeName(e.ai_overall_comment) ?? toSafeName(e.ai_comment),
    }));

    const participantsSet = new Set<string>();
    for (const s of songs) {
      if (s.selector) participantsSet.add(s.selector);
    }
    const roomId = toSafeName(m.room_id);
    if (roomId && m.completed_at) {
      const { data: accessRows } = await admin
        .from('room_access_log')
        .select('display_name, accessed_at')
        .eq('room_id', roomId)
        .gte('accessed_at', m.created_at)
        .lte('accessed_at', m.completed_at)
        .order('accessed_at', { ascending: true })
        .limit(500);
      for (const a of accessRows ?? []) {
        const dn = toSafeName(a.display_name);
        if (dn) participantsSet.add(dn);
        if (participantsSet.size >= 20) break;
      }
    }

    const ownerUserId = toSafeName(m.room_owner_user_id);
    const ownerName =
      (ownerUserId ? ownerDisplayByUserId.get(ownerUserId) : null) ??
      ownerUserId ??
      null;

    rows.push({
      mission_id: m.id,
      completed_at: m.completed_at || m.created_at,
      theme_id: m.theme_id,
      room_id: roomId,
      room_title: toSafeName(m.room_title),
      owner: ownerName,
      participants: Array.from(participantsSet),
      songs,
    });
  }

  return NextResponse.json({ days, rows });
}
