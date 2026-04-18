import type { ChatMessage } from '@/types/chat';

/** チャット表示用: 先頭の [DB] を出さない（旧ログ互換で除去のみ） */
export function stripDbPrefixForChatDisplay(body: string): string {
  if (body.startsWith('[DB] ')) return body.slice(5);
  if (body.startsWith('[DB]')) return body.slice(4).replace(/^\s+/, '');
  return body;
}

/** 曲解説・comment-pack 相当の AI 行（いいね／NG ツールバー対象） */
export function isAiTidbitToolbarMessage(m: ChatMessage): boolean {
  if (m.messageType !== 'ai') return false;
  if (m.body.startsWith('[NEW]') || m.body.startsWith('[DB]')) return true;
  return m.aiSource === 'tidbit' && Boolean(m.tidbitId?.trim());
}
