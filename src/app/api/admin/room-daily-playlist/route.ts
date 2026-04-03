import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStyleAdminUserIds } from '@/lib/style-admin';

export const dynamic = 'force-dynamic';

type PlaylistRow = {
  played_at: string;
  display_name: string;
  video_id: string;
  title: string | null;
  artist_name: string | null;
  style: string | null;
  era: string | null;
};

function jstDayRangeUtc(ymd: string): { startIso: string; endIso: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const start = new Date(`${ymd}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

async function requireAdmin() {
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 }) };

  const adminIds = getStyleAdminUserIds();
  if (adminIds.length === 0) {
    return {
      error: NextResponse.json(
        { error: 'STYLE_ADMIN_USER_IDS を .env.local に設定し、管理者アカウントでログインしてください。' },
        { status: 403 },
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
            'ログインが確認できません。マイページからログインしてから /admin/room-daily-summary を開き直してください。',
          hint: authError?.message,
        },
        { status: 403 },
      ),
    };
  }
  if (!adminIds.includes(uid)) {
    return {
      error: NextResponse.json({ error: 'このアカウントは STYLE_ADMIN_USER_IDS に含まれていません。' }, { status: 403 }),
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { error: NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 }) };
  }
  return { supabase, admin };
}

function toText(roomId: string, dateJst: string, items: PlaylistRow[]): string {
  const lines: string[] = [];
  lines.push(`部屋ID: ${roomId}`);
  lines.push(`日付（JST）: ${dateJst}`);
  lines.push(`件数: ${items.length}`);
  lines.push('---');
  lines.push('');
  items.forEach((r) => {
    const time = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(r.played_at));
    lines.push(
      `[${time}] ${r.display_name} / ${r.era ?? 'Other'} / ${r.style ?? 'Other'} / ${r.artist_name ?? '—'} - ${r.title ?? r.video_id} / https://www.youtube.com/watch?v=${r.video_id}`,
    );
  });
  return lines.join('\n') + '\n';
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function toCsv(items: PlaylistRow[]): string {
  const header = ['played_at_jst', 'display_name', 'era', 'style', 'artist_name', 'title', 'video_id', 'youtube_url'];
  const rows = [header.join(',')];
  items.forEach((r) => {
    const t = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(new Date(r.played_at))
      .replace(' ', 'T');
    const cols = [
      t,
      r.display_name ?? '',
      r.era ?? '',
      r.style ?? '',
      r.artist_name ?? '',
      r.title ?? '',
      r.video_id ?? '',
      `https://www.youtube.com/watch?v=${r.video_id ?? ''}`,
    ];
    rows.push(cols.map((c) => csvEscape(String(c))).join(','));
  });
  return rows.join('\n') + '\n';
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId')?.trim() ?? '';
  const dateJst = searchParams.get('dateJst')?.trim() ?? '';
  const format = searchParams.get('format')?.trim().toLowerCase() ?? 'json';
  const download = searchParams.get('download') === '1' || searchParams.get('download') === 'true';

  if (!roomId || !dateJst) {
    return NextResponse.json({ error: 'roomId and dateJst are required' }, { status: 400 });
  }
  const range = jstDayRangeUtc(dateJst);
  if (!range) {
    return NextResponse.json({ error: 'dateJst は YYYY-MM-DD 形式で指定してください' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('room_playback_history')
    .select('played_at, display_name, video_id, title, artist_name, style')
    .eq('room_id', roomId)
    .gte('played_at', range.startIso)
    .lt('played_at', range.endIso)
    .order('played_at', { ascending: true });
  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: 'room_playback_history テーブルがありません。',
          hint: 'docs/supabase-room-playback-history-table.md の SQL を実行してください。',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const base = (data ?? []) as Array<{
    played_at: string;
    display_name: string;
    video_id: string;
    title: string | null;
    artist_name: string | null;
    style: string | null;
  }>;
  const videoIds = Array.from(new Set(base.map((r) => r.video_id).filter(Boolean)));
  let eraMap = new Map<string, string>();
  if (videoIds.length > 0) {
    const { data: eraRows, error: eraErr } = await supabase
      .from('song_era')
      .select('video_id, era')
      .in('video_id', videoIds);
    if (!eraErr && eraRows?.length) {
      eraMap = new Map(
        eraRows
          .filter((r) => typeof r.video_id === 'string' && typeof r.era === 'string')
          .map((r) => [r.video_id as string, r.era as string]),
      );
    }
  }

  const items: PlaylistRow[] = base.map((r) => ({
    ...r,
    era: eraMap.get(r.video_id) ?? null,
  }));

  if (format === 'text') {
    const text = toText(roomId, dateJst, items);
    const headers = new Headers({
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    if (download) headers.set('Content-Disposition', `attachment; filename="playlist-${dateJst}-${roomId}.txt"`);
    return new NextResponse(text, { status: 200, headers });
  }
  if (format === 'csv') {
    const csv = toCsv(items);
    const headers = new Headers({
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    if (download) headers.set('Content-Disposition', `attachment; filename="playlist-${dateJst}-${roomId}.csv"`);
    return new NextResponse(csv, { status: 200, headers });
  }

  return NextResponse.json({ items });
}

