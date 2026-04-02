import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isValidAiGuardObjectionReasonIds } from '@/lib/ai-guard-objection';

export const dynamic = 'force-dynamic';

const MAX_FREE_COMMENT = 3000;
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
 * AI 質問ガード（イエローカード）警告に対する異議申立て。
 * ログイン時は user_id を付与、ゲストは user_id null（RLS は insert のみ許可）。
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id ?? null;

  let body: {
    roomId?: string;
    chatMessageId?: string;
    systemMessageBody?: string;
    warningCount?: number;
    guardAction?: string;
    reasonKeys?: string[];
    freeComment?: string;
    conversationSnapshot?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const roomId = typeof body.roomId === 'string' && body.roomId.trim() ? body.roomId.trim() : '';
  const chatMessageId =
    typeof body.chatMessageId === 'string' && body.chatMessageId.trim()
      ? body.chatMessageId.trim()
      : '';
  const systemMessageBody =
    typeof body.systemMessageBody === 'string' && body.systemMessageBody.trim()
      ? body.systemMessageBody.trim()
      : '';
  const warningCount =
    typeof body.warningCount === 'number' && Number.isFinite(body.warningCount)
      ? Math.max(0, Math.floor(body.warningCount))
      : -1;
  const guardAction =
    typeof body.guardAction === 'string' && body.guardAction.trim() ? body.guardAction.trim() : '';
  const freeComment =
    typeof body.freeComment === 'string' ? body.freeComment.trim().slice(0, MAX_FREE_COMMENT) : '';

  if (!roomId || !chatMessageId || !systemMessageBody || warningCount < 0) {
    return NextResponse.json({ error: 'roomId, chatMessageId, systemMessageBody, warningCount が必要です。' }, {
      status: 400,
    });
  }
  if (!['warn', 'yellow', 'ban'].includes(guardAction)) {
    return NextResponse.json({ error: 'guardAction が不正です。' }, { status: 400 });
  }
  const reasonKeys = body.reasonKeys;
  if (!isValidAiGuardObjectionReasonIds(reasonKeys)) {
    return NextResponse.json({ error: '異議理由を1つ以上選んでください。' }, { status: 400 });
  }

  const conversationSnapshot = normalizeSnapshot(body.conversationSnapshot);
  if (!conversationSnapshot || conversationSnapshot.length === 0) {
    return NextResponse.json({ error: '会話スナップショットが不正です。' }, { status: 400 });
  }

  const row = {
    user_id: uid,
    room_id: roomId,
    chat_message_id: chatMessageId,
    system_message_body: systemMessageBody,
    warning_count: warningCount,
    guard_action: guardAction,
    reason_keys: reasonKeys,
    free_comment: freeComment || null,
    conversation_snapshot: conversationSnapshot,
  };

  const { error } = await supabase.from('ai_question_guard_objections').insert(row);

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'この警告には既に異議申立てを送信済みです。' }, { status: 409 });
    }
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error:
            'データベースにテーブルがありません。docs/supabase-setup.md の「11. AI 質問ガード異議申立て」を参照して SQL を実行してください。',
        },
        { status: 503 }
      );
    }
    console.error('[ai-question-guard-objection POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
