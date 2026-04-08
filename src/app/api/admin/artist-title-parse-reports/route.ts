import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  created_at: string;
  reporter_user_id: string;
  room_id: string | null;
  message_kind: string;
  video_id: string;
  chat_message_body: string | null;
  reporter_note: string | null;
  snapshot: unknown;
};

/**
 * STYLE_ADMIN + service_role。直近の報告一覧（JSON 表示・エクスポート用）。
 */
export async function GET(request: Request) {
  const adminCheck = await requireStyleAdminApi();
  if (!adminCheck.ok) return adminCheck.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY が設定されていません。' },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get('limit');
  const limit = Math.min(500, Math.max(1, parseInt(limitRaw ?? '100', 10) || 100));

  const { data, error, count } = await admin
    .from('artist_title_parse_reports')
    .select(
      'id, created_at, reporter_user_id, room_id, message_kind, video_id, chat_message_body, reporter_note, snapshot',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: 'artist_title_parse_reports テーブルがありません。',
          hint: 'docs/supabase-setup.md の「13. アーティスト／曲名スナップショット報告」を参照してください。',
          rows: [],
          total: 0,
        },
        { status: 503 },
      );
    }
    console.error('[artist-title-parse-reports GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    rows: (data ?? []) as Row[],
    total: count ?? (data?.length ?? 0),
  });
}
