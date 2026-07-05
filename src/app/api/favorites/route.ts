import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  favoriteRowNeedsMetadata,
  resolveFavoriteVideoMetadata,
} from '@/lib/favorite-video-metadata';

export const dynamic = 'force-dynamic';

export type FavoriteItem = {
  id: string;
  video_id: string;
  display_name: string;
  played_at: string;
  title: string | null;
  artist_name: string | null;
};

async function enrichFavoriteItems(items: FavoriteItem[]): Promise<FavoriteItem[]> {
  const admin = createAdminClient();
  if (!admin || items.length === 0) return items;

  const metadataByVideo = new Map<string, { title: string | null; artistName: string | null }>();
  const needsLookup = Array.from(
    new Set(
      items
        .filter((row) => favoriteRowNeedsMetadata(row.title, row.artist_name))
        .map((row) => row.video_id.trim())
        .filter(Boolean),
    ),
  );

  await Promise.all(
    needsLookup.map(async (videoId) => {
      const meta = await resolveFavoriteVideoMetadata(admin, videoId);
      metadataByVideo.set(videoId, meta);
    }),
  );

  return items.map((row) => {
    if (!favoriteRowNeedsMetadata(row.title, row.artist_name)) return row;
    const meta = metadataByVideo.get(row.video_id.trim());
    if (!meta) return row;
    return {
      ...row,
      title: row.title?.trim() || meta.title,
      artist_name: row.artist_name?.trim() || meta.artistName,
    };
  });
}

/**
 * GET: 自分のお気に入り一覧。?idsOnly=1 のときは videoIds のみ返す（視聴履歴のハート表示用）
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idsOnly = searchParams.get('idsOnly') === '1';

  // select 文字列を固定にすると Supabase の行型が正しく推論される（動的 select は ParserError になる）
  if (idsOnly) {
    const { data, error } = await supabase
      .from('user_favorites')
      .select('video_id')
      .eq('user_id', user.id)
      .order('played_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json(
          { error: 'お気に入りテーブルがありません。docs/supabase-user-favorites-table.md の SQL を実行してください。' },
          { status: 503 }
        );
      }
      console.error('[favorites GET]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const videoIds = (data ?? []).map((r) => r.video_id);
    return NextResponse.json({ videoIds });
  }

  const { data, error } = await supabase
    .from('user_favorites')
    .select('id, video_id, display_name, played_at, title, artist_name')
    .eq('user_id', user.id)
    .order('played_at', { ascending: false });

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'お気に入りテーブルがありません。docs/supabase-user-favorites-table.md の SQL を実行してください。' },
        { status: 503 }
      );
    }
    console.error('[favorites GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: await enrichFavoriteItems((data ?? []) as FavoriteItem[]) });
}

/**
 * POST: お気に入りに追加。同じ video_id は1件のみ（重複時は既存のまま）
 * Body: { videoId, displayName, playedAt, title?, artistName? }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  let body: { videoId?: string; displayName?: string; playedAt?: string; title?: string; artistName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const playedAt = typeof body?.playedAt === 'string' ? body.playedAt.trim() : '';

  if (!videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
  }

  let title = typeof body?.title === 'string' ? body.title.trim() || null : null;
  let artistName = typeof body?.artistName === 'string' ? body.artistName.trim() || null : null;
  const playedAtDate = playedAt ? new Date(playedAt) : new Date();
  if (Number.isNaN(playedAtDate.getTime())) {
    return NextResponse.json({ error: 'playedAt must be valid ISO date' }, { status: 400 });
  }

  if (favoriteRowNeedsMetadata(title, artistName)) {
    const admin = createAdminClient();
    const resolved = await resolveFavoriteVideoMetadata(admin, videoId);
    if (!title?.trim()) title = resolved.title;
    if (!artistName?.trim()) artistName = resolved.artistName;
  }

  const { error } = await supabase.from('user_favorites').insert({
    user_id: user.id,
    video_id: videoId,
    display_name: displayName || '—',
    played_at: playedAtDate.toISOString(),
    title,
    artist_name: artistName,
  });

  if (error) {
    if (error.code === '23505') {
      if (title || artistName) {
        const { data: existing } = await supabase
          .from('user_favorites')
          .select('title, artist_name')
          .eq('user_id', user.id)
          .eq('video_id', videoId)
          .maybeSingle();
        const patch: { title?: string; artist_name?: string } = {};
        if (title && favoriteRowNeedsMetadata(existing?.title ?? null, existing?.artist_name ?? null)) {
          patch.title = title;
        }
        if (artistName && !(existing?.artist_name ?? '').trim()) {
          patch.artist_name = artistName;
        }
        if (Object.keys(patch).length > 0) {
          await supabase
            .from('user_favorites')
            .update(patch)
            .eq('user_id', user.id)
            .eq('video_id', videoId);
        }
      }
      return NextResponse.json({ ok: true });
    }
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'お気に入りテーブルがありません。docs/supabase-user-favorites-table.md の SQL を実行してください。' },
        { status: 503 }
      );
    }
    console.error('[favorites POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE: お気に入り解除。?videoId=xxx
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId')?.trim() ?? '';
  if (!videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('video_id', videoId);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'お気に入りテーブルがありません。' },
        { status: 503 }
      );
    }
    console.error('[favorites DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
