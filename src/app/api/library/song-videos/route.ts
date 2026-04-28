import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchOEmbed } from '@/lib/youtube-oembed';

export const dynamic = 'force-dynamic';

type LibrarySongVideoItem = {
  video_id: string;
  variant: string | null;
};

function normalizeVariant(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  return t ? t : null;
}

function variantRank(raw: string | null | undefined): number {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'official') return 0;
  if (v === 'topic') return 1;
  if (v === 'lyric') return 2;
  if (v === 'live') return 3;
  if (v) return 4;
  return 5;
}

function inferVariantFromVideoTitle(title: string | null | undefined): string | null {
  const t = (title ?? '').toLowerCase();
  if (!t) return null;
  if (/\blive\b|live at|live from|concert|acoustic session/.test(t)) return 'live';
  if (/\blyric\b|lyrics\b/.test(t)) return 'lyric';
  if (/\bofficial\b|official music video|official video|\bmv\b/.test(t)) return 'official';
  if (/\btopic\b/.test(t)) return 'topic';
  return null;
}

/**
 * GET: 曲IDに紐づく動画候補を返す（公式優先ソート）。
 * Query: songId（必須）
 */
export async function GET(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const url = new URL(request.url);
  const songId = (url.searchParams.get('songId') ?? '').trim();
  if (!songId) {
    return NextResponse.json({ error: 'songId が必要です。' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('song_videos')
    .select('video_id, variant, created_at')
    .eq('song_id', songId)
    .order('created_at', { ascending: true });
  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ items: [] as LibrarySongVideoItem[] });
    }
    console.error('[api/library/song-videos]', error);
    return NextResponse.json({ error: '動画候補の取得に失敗しました。' }, { status: 500 });
  }

  const unique = new Map<string, string | null>();
  for (const row of (data ?? []) as { video_id?: string; variant?: string | null }[]) {
    const videoId = typeof row.video_id === 'string' ? row.video_id.trim() : '';
    if (!videoId) continue;
    if (!unique.has(videoId)) unique.set(videoId, normalizeVariant(row.variant));
  }

  const items: LibrarySongVideoItem[] = (
    await Promise.all(
      [...unique.entries()].map(async ([video_id, variant]) => {
        const title = (await fetchOEmbed(video_id))?.title ?? null;
        const inferred = inferVariantFromVideoTitle(title);
        return {
          video_id,
          variant: inferred ?? variant,
        };
      }),
    )
  )
    .sort((a, b) => variantRank(a.variant) - variantRank(b.variant));

  return NextResponse.json({ songId, items });
}

