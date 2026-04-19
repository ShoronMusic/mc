/**
 * room_chat_log の行から「@ 質問 → 直後の AI 応答」を組み立てる（管理画面用）。
 */

export type RoomChatLogRow = {
  created_at: string;
  message_type: string;
  display_name: string;
  body: string;
};

export type AtChatPairFromLog = {
  userDisplayName: string;
  userBody: string;
  userCreatedAt: string;
  aiBody: string;
  aiCreatedAt: string;
  /** 会話スナップショットと突き合わせて付いた異議レコード id */
  objectionIds: string[];
};

export function normalizeChatBodyForMatch(s: string): string {
  return s.trim().normalize('NFKC').replace(/\s+/g, ' ');
}

export function isAtUserMessageBody(body: string): boolean {
  return /^[@＠]/u.test(body.trim());
}

function extractAtUserBodiesFromSnapshot(snapshot: unknown): string[] {
  if (!Array.isArray(snapshot)) return [];
  const out: string[] = [];
  for (const item of snapshot) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const mt = typeof o.messageType === 'string' ? o.messageType : '';
    const body = typeof o.body === 'string' ? o.body : '';
    if (mt === 'user' && isAtUserMessageBody(body)) {
      out.push(normalizeChatBodyForMatch(body));
    }
  }
  return out;
}

export function buildAtChatPairsFromLogRows(rows: readonly RoomChatLogRow[]): AtChatPairFromLog[] {
  const pairs: AtChatPairFromLog[] = [];
  const list = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    if ((u.message_type ?? '') !== 'user') continue;
    if (!isAtUserMessageBody(u.body)) continue;

    let j = i + 1;
    while (j < list.length && (list[j].message_type ?? '') === 'system') {
      j += 1;
    }
    if (j >= list.length) continue;
    const a = list[j];
    if ((a.message_type ?? '') !== 'ai') continue;

    pairs.push({
      userDisplayName: (u.display_name ?? '').trim() || 'ユーザー',
      userBody: u.body,
      userCreatedAt: u.created_at,
      aiBody: a.body,
      aiCreatedAt: a.created_at,
      objectionIds: [],
    });
  }
  return pairs;
}

export type ObjectionRowLite = {
  id: string;
  created_at: string;
  reason_keys?: string[] | null;
  free_comment?: string | null;
  conversation_snapshot?: unknown;
};

export function attachObjectionsToAtPairs(
  pairs: AtChatPairFromLog[],
  objections: readonly ObjectionRowLite[]
): void {
  const normQuestions = pairs.map((p) => normalizeChatBodyForMatch(p.userBody));

  for (const obj of objections) {
    const snapBodies = extractAtUserBodiesFromSnapshot(obj.conversation_snapshot);
    if (snapBodies.length === 0) continue;

    for (let pi = 0; pi < pairs.length; pi++) {
      const nq = normQuestions[pi]!;
      if (snapBodies.some((sb) => sb === nq || sb.includes(nq) || nq.includes(sb))) {
        const ids = pairs[pi]!.objectionIds;
        if (!ids.includes(obj.id)) ids.push(obj.id);
      }
    }
  }
}
