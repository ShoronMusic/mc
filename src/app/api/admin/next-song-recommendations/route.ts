import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  normalizeNextSongPickMatchKey,
  softDeleteNextSongRecommendById,
} from '@/lib/next-song-recommend-store';
import {
  resolveNextSongPickCatalogHit,
  type NextSongPickCatalogHit,
} from '@/lib/next-song-recommend-catalog-resolve';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveCatalogForRows(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  rows: Array<{ recommended_artist: string; recommended_title: string }>,
): Promise<Map<string, NextSongPickCatalogHit>> {
  const unique = new Map<string, { artist: string; title: string }>();
  for (const row of rows) {
    const artist = row.recommended_artist?.trim() ?? '';
    const title = row.recommended_title?.trim() ?? '';
    if (!artist || !title) continue;
    const key = normalizeNextSongPickMatchKey(artist, title);
    if (!unique.has(key)) unique.set(key, { artist, title });
  }

  const resolved = new Map<string, NextSongPickCatalogHit>();
  const entries = [...unique.entries()];
  const concurrency = 6;
  for (let i = 0; i < entries.length; i += concurrency) {
    await Promise.all(
      entries.slice(i, i + concurrency).map(async ([key, pick]) => {
        resolved.set(
          key,
          await resolveNextSongPickCatalogHit(admin, pick.artist, pick.title),
        );
      }),
    );
  }
  return resolved;
}

export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }
  const limit = Math.min(500, Math.max(1, parseInt(new URL(request.url).searchParams.get('limit') || '200', 10) || 200));
  const { data: rows, error } = await admin
    .from('next_song_recommendations')
    .select(
      'id, seed_song_id, seed_video_id, seed_label, recommended_artist, recommended_title, reason, youtube_search_query, order_index, is_active, created_at',
    )
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'next_song_recommendations テーブルがありません。', hint: 'SQL を適用してください。', rows: [] },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const recRows = Array.isArray(rows) ? rows : [];
  const catalogByPick = await resolveCatalogForRows(
    admin,
    recRows as Array<{ recommended_artist: string; recommended_title: string }>,
  );
  const recIds = recRows.map((r: any) => r.id).filter(Boolean);
  const feedbackByRecId = new Map<string, { good: number; bad: number; commentCount: number }>();
  if (recIds.length > 0) {
    const { data: fbRows } = await admin
      .from('comment_feedback')
      .select('ai_message_id, is_upvote, free_comment')
      .eq('source', 'next_song_recommend')
      .in('ai_message_id', recIds);
    for (const r of fbRows ?? []) {
      const id = (r as any).ai_message_id as string;
      if (!id) continue;
      const cur = feedbackByRecId.get(id) ?? { good: 0, bad: 0, commentCount: 0 };
      if ((r as any).is_upvote === true) cur.good += 1;
      if ((r as any).is_upvote === false) cur.bad += 1;
      if (typeof (r as any).free_comment === 'string' && (r as any).free_comment.trim()) cur.commentCount += 1;
      feedbackByRecId.set(id, cur);
    }
  }
  return NextResponse.json({
    rows: recRows.map((r: any) => ({
      ...r,
      feedback: feedbackByRecId.get(r.id) ?? { good: 0, bad: 0, commentCount: 0 },
      catalog:
        catalogByPick.get(
          normalizeNextSongPickMatchKey(
            typeof r.recommended_artist === 'string' ? r.recommended_artist : '',
            typeof r.recommended_title === 'string' ? r.recommended_title : '',
          ),
        ) ?? null,
    })),
  });
}

export async function DELETE(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }
  const id = new URL(request.url).searchParams.get('id')?.trim() ?? '';
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id が無効です。' }, { status: 400 });
  }
  const ok = await softDeleteNextSongRecommendById(admin, id);
  if (!ok) {
    return NextResponse.json({ error: '対象が見つかりません。' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}

