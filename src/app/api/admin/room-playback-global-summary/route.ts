import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStyleAdminUserIds } from '@/lib/style-admin';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 1000;
const MAX_SCAN = 120_000;

type PlaybackRow = {
  played_at: string;
  video_id: string;
  artist_name: string | null;
  title: string | null;
  style: string | null;
  room_id: string;
};

type EraRow = {
  video_id: string;
  era: string | null;
};

function toPeriodKey(iso: string, granularity: 'day' | 'month' | 'year'): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  if (granularity === 'year') return `${y}`;
  if (granularity === 'month') return `${y}-${m}`;
  return `${y}-${m}-${day}`;
}

function defaultFromIso(): string {
  const d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  return d.toISOString();
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
            'ログインが確認できません。マイページからログインしてから /admin/room-playback-global-summary を開き直してください。',
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
  return { admin };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { admin } = auth;

  const { searchParams } = new URL(request.url);
  const granularityRaw = (searchParams.get('granularity') ?? 'day').trim();
  const granularity = granularityRaw === 'year' ? 'year' : granularityRaw === 'month' ? 'month' : 'day';
  const fromIsoRaw = searchParams.get('from')?.trim();
  const toIsoRaw = searchParams.get('to')?.trim();
  const fromIso = fromIsoRaw ? new Date(fromIsoRaw).toISOString() : defaultFromIso();
  const toIso = toIsoRaw ? new Date(toIsoRaw).toISOString() : new Date().toISOString();

  const rows: PlaybackRow[] = [];
  let scanned = 0;
  let truncated = false;
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from('room_playback_history')
      .select('played_at, video_id, artist_name, title, style, room_id')
      .gte('played_at', fromIso)
      .lte('played_at', toIso)
      .order('played_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
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
    const batch = (data ?? []) as PlaybackRow[];
    if (batch.length === 0) break;
    rows.push(...batch);
    scanned += batch.length;
    if (scanned >= MAX_SCAN) {
      truncated = batch.length === PAGE_SIZE;
      break;
    }
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const videoIds = Array.from(new Set(rows.map((r) => r.video_id).filter(Boolean)));
  const eraByVideo = new Map<string, string>();
  if (videoIds.length > 0) {
    const { data: eraData, error: eraError } = await admin.from('song_era').select('video_id, era').in('video_id', videoIds);
    if (!eraError && eraData?.length) {
      (eraData as EraRow[]).forEach((e) => {
        if (e.video_id && e.era) eraByVideo.set(e.video_id, e.era);
      });
    }
  }

  const byPeriod = new Map<string, number>();
  const byArtist = new Map<string, number>();
  const byStyle = new Map<string, number>();
  const byEra = new Map<string, number>();
  const byTrack = new Map<string, { artist: string; title: string; videoId: string; count: number }>();

  rows.forEach((r) => {
    const periodKey = toPeriodKey(r.played_at, granularity);
    byPeriod.set(periodKey, (byPeriod.get(periodKey) ?? 0) + 1);

    const artist = (r.artist_name ?? '不明アーティスト').trim() || '不明アーティスト';
    byArtist.set(artist, (byArtist.get(artist) ?? 0) + 1);

    const style = (r.style ?? 'Other').trim() || 'Other';
    byStyle.set(style, (byStyle.get(style) ?? 0) + 1);

    const era = (eraByVideo.get(r.video_id) ?? 'Other').trim() || 'Other';
    byEra.set(era, (byEra.get(era) ?? 0) + 1);

    const title = (r.title ?? r.video_id).trim();
    const trackKey = `${r.video_id}\t${artist}\t${title}`;
    const prev = byTrack.get(trackKey);
    if (prev) prev.count += 1;
    else byTrack.set(trackKey, { artist, title, videoId: r.video_id, count: 1 });
  });

  return NextResponse.json({
    granularity,
    fromIso,
    toIso,
    totals: {
      selections: rows.length,
      artists: byArtist.size,
      tracks: byTrack.size,
      rooms: new Set(rows.map((r) => r.room_id)).size,
    },
    byPeriod: Array.from(byPeriod.entries())
      .map(([period, count]) => ({ period, count }))
      .sort((a, b) => a.period.localeCompare(b.period)),
    byArtist: Array.from(byArtist.entries())
      .map(([artist, count]) => ({ artist, count }))
      .sort((a, b) => b.count - a.count)
      .filter((r) => r.count >= 3)
      .slice(0, 100),
    styleDistribution: Array.from(byStyle.entries())
      .map(([style, count]) => ({ style, count }))
      .sort((a, b) => b.count - a.count),
    eraDistribution: Array.from(byEra.entries())
      .map(([era, count]) => ({ era, count }))
      .sort((a, b) => b.count - a.count),
    popularTracks: Array.from(byTrack.values())
      .sort((a, b) => b.count - a.count)
      .filter((r) => r.count >= 3)
      .slice(0, 100),
    scanned,
    truncated,
  });
}

