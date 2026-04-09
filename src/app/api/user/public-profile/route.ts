import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeUserPublicProfileBody } from '@/lib/user-public-profile';

export const dynamic = 'force-dynamic';

/**
 * GET: 自分の公開プロフィール（未作成はデフォルト値）
 * PUT: 保存（upsert）
 */
export async function GET() {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    }
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_public_profile')
      .select('visible_in_rooms, tagline, favorite_artists, listening_note')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json(
          {
            error: 'user_public_profile テーブルがありません。docs/supabase-setup.md 第 16 章を実行してください。',
          },
          { status: 503 },
        );
      }
      console.error('[api/user/public-profile GET]', error);
      return NextResponse.json({ error: 'Failed to load.' }, { status: 500 });
    }

    const artists = Array.isArray(data?.favorite_artists)
      ? (data!.favorite_artists as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];

    return NextResponse.json({
      visibleInRooms: Boolean(data?.visible_in_rooms),
      tagline: typeof data?.tagline === 'string' ? data.tagline : '',
      favoriteArtists: artists,
      listeningNote: typeof data?.listening_note === 'string' ? data.listening_note : '',
    });
  } catch (e) {
    console.error('[api/user/public-profile GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    }
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = normalizeUserPublicProfileBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const v = parsed.value;

    const { error } = await supabase.from('user_public_profile').upsert(
      {
        user_id: user.id,
        visible_in_rooms: v.visibleInRooms,
        tagline: v.tagline,
        favorite_artists: v.favoriteArtists,
        listening_note: v.listeningNote,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json(
          {
            error: 'user_public_profile テーブルがありません。docs/supabase-setup.md 第 16 章を実行してください。',
          },
          { status: 503 },
        );
      }
      console.error('[api/user/public-profile PUT]', error);
      return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ...v });
  } catch (e) {
    console.error('[api/user/public-profile PUT]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
