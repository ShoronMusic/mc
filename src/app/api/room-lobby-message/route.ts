import Ably from 'ably';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  countLobbyMessageChars,
  normalizeDisplayTitleInput,
  normalizeLobbyMessageInput,
  ROOM_DISPLAY_TITLE_MAX_CHARS,
  ROOM_LOBBY_MESSAGE_MAX_CHARS,
} from '@/lib/room-lobby-message';
import { fetchRoomPresenceMembers, resolveRoomOwnerClientId } from '@/lib/room-owner-resolve-server';

export const dynamic = 'force-dynamic';

function safeRoomId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || t.length > 48) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) return null;
  return t;
}

function safeClientId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || t.length > 80) return null;
  if (!/^[a-zA-Z0-9._:-]+$/.test(t)) return null;
  return t;
}

function getAblyKey(): string {
  return process.env.NEXT_PUBLIC_ABLY_API_KEY?.trim() ?? '';
}

/** presence + history を合算。サーバーレス（例: Vercel 10s 制限）内に収める */
const ABLY_VERIFY_MS = 9_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

/**
 * GET ?roomId=01 — 入室前メッセージ（公開読み取り）
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = safeRoomId(searchParams.get('roomId') ?? '');
  if (!roomId) {
    return NextResponse.json({ error: 'roomId is required' }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ message: '' as const });
  }

  const { data, error } = await supabase
    .from('room_lobby_message')
    .select('message, display_title')
    .eq('room_id', roomId)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ message: '' as const, displayTitle: '' as const });
    }
    console.error('[room-lobby-message GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const msg = typeof data?.message === 'string' ? data.message.trim() : '';
  const displayTitle =
    data && typeof (data as { display_title?: unknown }).display_title === 'string'
      ? String((data as { display_title: string }).display_title).trim()
      : '';
  return NextResponse.json({ message: msg, displayTitle });
}

async function isLiveGatheringOrganizer(admin: NonNullable<ReturnType<typeof createAdminClient>>, roomId: string, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('room_gatherings')
    .select('id')
    .eq('room_id', roomId)
    .eq('status', 'live')
    .eq('created_by', userId)
    .maybeSingle();
  return !!data;
}

/**
 * POST { roomId, message, displayTitle?, clientId? }
 * - 開催中の会の主催者（room_gatherings.created_by）: clientId 不要
 * - それ以外: チャットオーナーのみ（Ably + clientId）
 */
export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'ルームメッセージの保存には SUPABASE_SERVICE_ROLE_KEY が必要です。' },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const roomId = safeRoomId(o.roomId);
  const clientId = safeClientId(o.clientId);
  const message = normalizeLobbyMessageInput(o.message);
  const displayTitle = normalizeDisplayTitleInput(o.displayTitle);

  if (!roomId) {
    return NextResponse.json({ error: 'roomId が必要です。' }, { status: 400 });
  }

  if (countLobbyMessageChars(message) > ROOM_LOBBY_MESSAGE_MAX_CHARS) {
    return NextResponse.json(
      { error: `PR文は${ROOM_LOBBY_MESSAGE_MAX_CHARS}文字以内にしてください。` },
      { status: 400 }
    );
  }

  if (countLobbyMessageChars(displayTitle) > ROOM_DISPLAY_TITLE_MAX_CHARS) {
    return NextResponse.json(
      { error: `部屋タイトルは${ROOM_DISPLAY_TITLE_MAX_CHARS}文字以内にしてください。` },
      { status: 400 }
    );
  }

  const supabaseUser = await createClient();
  const { data: { session } } = supabaseUser ? await supabaseUser.auth.getSession() : { data: { session: null } };
  const userId = session?.user?.id ?? '';

  let authorized = false;
  if (userId && (await isLiveGatheringOrganizer(admin, roomId, userId))) {
    authorized = true;
  }

  if (!authorized) {
    const ablyKey = getAblyKey();
    if (!ablyKey) {
      return NextResponse.json({ error: 'Ably が未設定です。主催者でない場合はチャットオーナー確認に必要です。' }, { status: 503 });
    }
    if (!clientId) {
      return NextResponse.json({ error: 'roomId と clientId が必要です（主催者でない場合）。' }, { status: 400 });
    }

    const rest = new Ably.Rest({ key: ablyKey });
    let members: Awaited<ReturnType<typeof fetchRoomPresenceMembers>>;
    let ownerId: string | null;
    try {
      const verified = await withTimeout(
        (async () => {
          const m = await fetchRoomPresenceMembers(rest, roomId);
          const own = await resolveRoomOwnerClientId(rest, roomId, m);
          return { members: m, ownerId: own };
        })(),
        ABLY_VERIFY_MS,
        'ably_lobby_verify'
      );
      members = verified.members;
      ownerId = verified.ownerId;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[room-lobby-message POST] ably verify', e);
      if (msg.includes('timed out')) {
        return NextResponse.json(
          { error: '参加状況・オーナー確認がタイムアウトしました。しばらくしてから再度お試しください。' },
          { status: 504 }
        );
      }
      return NextResponse.json({ error: '参加状況を確認できませんでした。' }, { status: 502 });
    }

    if (!members.some((m) => m.clientId === clientId)) {
      return NextResponse.json({ error: 'このルームに在室しているチャットオーナーのみ保存できます。' }, { status: 403 });
    }

    if (!ownerId || ownerId !== clientId) {
      return NextResponse.json({ error: 'チャットオーナーのみ保存できます。' }, { status: 403 });
    }
    authorized = true;
  }

  if (!authorized) {
    return NextResponse.json({ error: '保存できません。' }, { status: 403 });
  }

  const { error } = await admin.from('room_lobby_message').upsert(
    {
      room_id: roomId,
      message,
      display_title: displayTitle,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'room_id' }
  );

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error:
            'room_lobby_message テーブルがありません。docs/supabase-setup.md の「ルーム入室前メッセージ」に SQL があります。',
        },
        { status: 503 }
      );
    }
    if (error.message?.includes('display_title') || error.code === '42703') {
      return NextResponse.json(
        {
          error:
            'display_title 列がありません。docs/supabase-setup.md の「ルーム入室前メッセージ」に追記の alter を実行してください。',
        },
        { status: 503 }
      );
    }
    console.error('[room-lobby-message POST] upsert', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const });
}
