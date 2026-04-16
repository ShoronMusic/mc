import { NextResponse } from 'next/server';
import { buildArtistTitleParseReportSnapshot } from '@/lib/artist-title-parse-report-snapshot';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isChatStyleAdminUserId } from '@/lib/style-admin';

export const dynamic = 'force-dynamic';

const MAX_CHAT_BODY = 12000;
const MAX_NOTE = 2000;
const VID_RE = /^[a-zA-Z0-9_-]{11}$/;

const MESSAGE_KINDS = new Set(['announce_song', 'song_commentary']);

/**
 * STYLE_ADMIN のみ。YouTube メタ＋解析結果を DB に保存（アーティスト／曲名の不具合検証用）。
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? null;
  if (!uid) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  }
  if (!isChatStyleAdminUserId(uid)) {
    return NextResponse.json({ error: 'STYLE_ADMIN_USER_IDS に含まれるアカウントのみ保存できます。' }, { status: 403 });
  }

  let body: {
    roomId?: unknown;
    videoId?: unknown;
    messageKind?: unknown;
    chatBody?: unknown;
    reporterNote?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const videoId = typeof body.videoId === 'string' ? body.videoId.trim() : '';
  if (!VID_RE.test(videoId)) {
    return NextResponse.json({ error: 'videoId が不正です。' }, { status: 400 });
  }

  const messageKind =
    typeof body.messageKind === 'string' && MESSAGE_KINDS.has(body.messageKind.trim())
      ? body.messageKind.trim()
      : '';
  if (!messageKind) {
    return NextResponse.json({ error: 'messageKind は announce_song または song_commentary です。' }, { status: 400 });
  }

  const roomId =
    typeof body.roomId === 'string' && body.roomId.trim() ? body.roomId.trim().slice(0, 64) : null;

  let chatBody: string | null = null;
  if (typeof body.chatBody === 'string' && body.chatBody.trim()) {
    chatBody = body.chatBody.trim().slice(0, MAX_CHAT_BODY);
  }

  let reporterNote: string | null = null;
  if (typeof body.reporterNote === 'string' && body.reporterNote.trim()) {
    reporterNote = body.reporterNote.trim().slice(0, MAX_NOTE);
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'サーバー設定が不足しています（SUPABASE_SERVICE_ROLE_KEY）。' },
      { status: 503 },
    );
  }

  let snapshot: Awaited<ReturnType<typeof buildArtistTitleParseReportSnapshot>>;
  try {
    snapshot = await buildArtistTitleParseReportSnapshot(videoId, roomId);
  } catch (e) {
    console.error('[artist-title-parse-report] snapshot', e);
    return NextResponse.json({ error: 'スナップショット取得に失敗しました。' }, { status: 500 });
  }

  const row = {
    reporter_user_id: uid,
    room_id: roomId,
    message_kind: messageKind,
    video_id: videoId,
    chat_message_body: chatBody,
    reporter_note: reporterNote,
    snapshot,
  };

  const { data: inserted, error } = await admin
    .from('artist_title_parse_reports')
    .insert(row)
    .select('id, created_at')
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: 'artist_title_parse_reports テーブルがありません。',
          hint: 'docs/supabase-setup.md の「13. アーティスト／曲名スナップショット報告」を参照して SQL を実行してください。',
        },
        { status: 503 },
      );
    }
    console.error('[artist-title-parse-report POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted?.id, createdAt: inserted?.created_at });
}
