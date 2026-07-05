import type { ChatMessage } from '@/types/chat';

export type RoomChatLogRow = {
  clientMessageId?: string;
  createdAt: string;
  messageType: 'user' | 'ai' | 'system';
  displayName: string;
  body: string;
};

export type RoomChatLogScope = 'gathering' | 'day' | 'session';

export function displayNameForChatMessage(m: ChatMessage): string {
  const trimmed = m.displayName?.trim();
  if (trimmed) return trimmed;
  if (m.messageType === 'ai') return 'AI';
  if (m.messageType === 'system') return 'システム';
  return 'ゲスト';
}

export function chatMessagesToLogRows(messages: ChatMessage[]): RoomChatLogRow[] {
  return messages
    .map((m) => {
      const body = (typeof m.body === 'string' ? m.body : '').trim();
      if (!body) return null;
      return {
        clientMessageId: m.id,
        createdAt: m.createdAt,
        messageType: m.messageType,
        displayName: displayNameForChatMessage(m),
        body,
      };
    })
    .filter((r): r is RoomChatLogRow => r != null);
}

/** DB 行と未保存のライブ行を時系列マージ（clientMessageId で重複除去） */
export function mergeRoomChatLogRows(
  persisted: RoomChatLogRow[],
  live: RoomChatLogRow[],
): RoomChatLogRow[] {
  const seen = new Set<string>();
  const out: RoomChatLogRow[] = [];
  for (const row of [...persisted, ...live]) {
    const key = row.clientMessageId?.trim() || `${row.createdAt}|${row.messageType}|${row.body.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return out;
}

export function formatRoomChatLogTimeJst(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function roomChatLogScopeLabel(scope: RoomChatLogScope, dateJst?: string): string {
  if (scope === 'gathering') return '今回の会';
  if (scope === 'session') return 'この端末のセッション';
  if (dateJst) {
    const [y, m, d] = dateJst.split('-');
    if (y && m && d) return `${y}年${Number(m)}月${Number(d)}日（JST）`;
  }
  return '今日（JST）';
}

export function messageTypeLabel(type: RoomChatLogRow['messageType']): string {
  if (type === 'ai') return 'AI';
  if (type === 'system') return 'SYS';
  return 'USER';
}
