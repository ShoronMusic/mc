import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { countCoAttendanceGatherings } from '@/lib/user-co-attendance-count';
import { normalizeUserPublicProfileBody } from '@/lib/user-public-profile';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET: 自分の公開プロフィール（未作成はデフォルト値）
 * Query `forUserId` … 他ユーザーの行（RLS: 公開中のみ他人から可。本人は常に自分の行を読める）
 * PUT: 保存（upsert）
 */
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const forUserIdRaw = searchParams.get('forUserId')?.trim() ?? '';
    let targetUserId = user.id;
    if (forUserIdRaw.length > 0) {
      if (!UUID_RE.test(forUserIdRaw)) {
        return NextResponse.json({ error: 'forUserId が不正です。' }, { status: 400 });
      }
      targetUserId = forUserIdRaw;
    }

    const { data, error } = await supabase
      .from('user_public_profile')
      .select('visible_in_rooms, tagline, favorite_artists, listening_note')
      .eq('user_id', targetUserId)
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

    const isSelf = targetUserId === user.id;
    let coAttendanceCount: number | null = null;
    if (!isSelf) {
      const admin = createAdminClient();
      if (admin) {
        try {
          coAttendanceCount = await countCoAttendanceGatherings(admin, user.id, targetUserId);
        } catch (e) {
          console.error('[api/user/public-profile GET] co-attendance', e);
        }
      }
    }

    return NextResponse.json({
      visibleInRooms: Boolean(data?.visible_in_rooms),
      tagline: typeof data?.tagline === 'string' ? data.tagline : '',
      favoriteArtists: artists,
      listeningNote: typeof data?.listening_note === 'string' ? data.listening_note : '',
      /** 他人照会時、行が無い＝非公開または未登録 */
      hasRow: data != null,
      isSelf,
      /** 本人同士の同席「会」数（本人照会時は null） */
      coAttendanceCount,
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
