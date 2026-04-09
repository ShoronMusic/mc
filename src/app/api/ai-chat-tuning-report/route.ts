import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTidbitModerator } from '@/lib/tidbit-moderator';

export const dynamic = 'force-dynamic';

const MAX_NOTE = 4000;
const MAX_SNAPSHOT_MESSAGES = 40;
const MAX_SNAPSHOT_BODY = 8000;

type SnapshotRow = {
  displayName?: string;
  messageType: string;
  body: string;
  createdAt: string;
};

function normalizeSnapshot(raw: unknown): SnapshotRow[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SnapshotRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const o = item as Record<string, unknown>;
    const body = typeof o.body === 'string' ? o.body : '';
    const createdAt = typeof o.createdAt === 'string' ? o.createdAt : '';
    const messageType = typeof o.messageType === 'string' ? o.messageType : '';
    if (!createdAt || !messageType) return null;
    const displayName = typeof o.displayName === 'string' ? o.displayName : undefined;
    const safeBody =
      body.length > MAX_SNAPSHOT_BODY ? `${body.slice(0, MAX_SNAPSHOT_BODY)}\n…（省略）` : body;
    out.push({ displayName, messageType, body: safeBody, createdAt });
    if (out.length > MAX_SNAPSHOT_MESSAGES) return null;
  }
  return out;
}

/**
 * AI_TIDBIT_MODERATOR_USER_IDS（または EMAILS）のユーザーだけが、
 * チャット前後のスナップショットとメモを DB に保存できる（チューニング用）。
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id || !isTidbitModerator(user)) {
    return NextResponse.json({ error: 'この操作は許可されていません。' }, { status: 403 });
  }

  let body: {
    roomId?: string;
    anchorMessageId?: string;
    anchorMessageType?: string;
    moderatorNote?: string;
    conversationSnapshot?: unknown;
    currentVideoId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const roomId = typeof body.roomId === 'string' && body.roomId.trim() ? body.roomId.trim() : '';
  const anchorMessageId =
    typeof body.anchorMessageId === 'string' && body.anchorMessageId.trim()
      ? body.anchorMessageId.trim()
      : '';
  const anchorMessageType =
    typeof body.anchorMessageType === 'string' && body.anchorMessageType.trim()
      ? body.anchorMessageType.trim()
      : '';
  const moderatorNote =
    typeof body.moderatorNote === 'string' ? body.moderatorNote.trim().slice(0, MAX_NOTE) : '';
  const currentVideoIdRaw = body.currentVideoId;
  const currentVideoId =
    typeof currentVideoIdRaw === 'string' && currentVideoIdRaw.trim()
      ? currentVideoIdRaw.trim().slice(0, 32)
      : null;

  if (!roomId || !anchorMessageId || !anchorMessageType) {
    return NextResponse.json(
      { error: 'roomId, anchorMessageId, anchorMessageType が必要です。' },
      { status: 400 },
    );
  }
  if (!['user', 'ai', 'system'].includes(anchorMessageType)) {
    return NextResponse.json({ error: 'anchorMessageType が不正です。' }, { status: 400 });
  }
  if (!moderatorNote) {
    return NextResponse.json({ error: 'メモ（moderatorNote）を入力してください。' }, { status: 400 });
  }

  const conversationSnapshot = normalizeSnapshot(body.conversationSnapshot);
  if (!conversationSnapshot || conversationSnapshot.length === 0) {
    return NextResponse.json({ error: '会話スナップショットが不正です。' }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'サーバー設定（SUPABASE_SERVICE_ROLE_KEY）が不足しています。' }, {
      status: 503,
    });
  }

  const reporterEmail = (user.email ?? '').trim().slice(0, 320) || null;

  const row = {
    reporter_user_id: user.id,
    reporter_email: reporterEmail,
    room_id: roomId,
    anchor_message_id: anchorMessageId,
    anchor_message_type: anchorMessageType,
    current_video_id: currentVideoId,
    moderator_note: moderatorNote,
    conversation_snapshot: conversationSnapshot,
  };

  const { error } = await admin.from('ai_chat_conversation_tuning_reports').insert(row);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error:
            'データベースにテーブルがありません。docs/supabase-setup.md の「11.2 AI チャットチューニング報告」の SQL を実行してください。',
        },
        { status: 503 },
      );
    }
    console.error('[ai-chat-tuning-report POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
