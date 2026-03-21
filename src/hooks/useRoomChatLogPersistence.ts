'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { ChatMessage } from '@/types/chat';

const FIVE_MIN_MS = 5 * 60 * 1000;
const MAX_BODY = 2000;

/**
 * ルーム内チャットを room_chat_log にバッチ保存する。
 * 5分間隔・タブ非表示 / pagehide 時にフラッシュ。client_message_id の unique で再送しても安全。
 */
export function useRoomChatLogPersistence(
  roomId: string | undefined,
  messages: ChatMessage[],
  options: { isGuest: boolean; myClientId: string }
): void {
  const { isGuest, myClientId } = options;
  const loggedIdsRef = useRef<Set<string>>(new Set());
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    loggedIdsRef.current.clear();
  }, [roomId]);

  const flushRoomChatLog = useCallback(
    async (opts: { keepalive?: boolean }) => {
      const rid = roomId?.trim();
      if (!rid) return;

      const list = messagesRef.current;
      const pending = list.filter((m) => !loggedIdsRef.current.has(m.id));
      if (pending.length === 0) return;

      const entries: Array<{
        client_message_id: string;
        created_at: string;
        message_type: 'user' | 'ai' | 'system';
        display_name: string;
        body: string;
        from_current_session_user: boolean;
      }> = [];

      for (const m of pending) {
        const displayName =
          m.displayName?.trim() ||
          (m.messageType === 'ai' ? 'AI' : m.messageType === 'system' ? 'システム' : 'ゲスト');
        let body = typeof m.body === 'string' ? m.body : '';
        if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY);
        const trimmed = body.trim();
        if (!trimmed) {
          loggedIdsRef.current.add(m.id);
          continue;
        }

        const fromCurrentSessionUser =
          !isGuest &&
          m.messageType === 'user' &&
          (myClientId === '' || (m.clientId ?? '') === myClientId);

        entries.push({
          client_message_id: m.id,
          created_at: m.createdAt,
          message_type: m.messageType,
          display_name: displayName.slice(0, 200),
          body: trimmed.slice(0, MAX_BODY),
          from_current_session_user: fromCurrentSessionUser,
        });
      }

      if (entries.length === 0) return;

      try {
        const res = await fetch('/api/room-chat-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: rid, entries }),
          keepalive: opts.keepalive === true,
        });
        if (res.ok) {
          for (const m of pending) {
            loggedIdsRef.current.add(m.id);
          }
        }
      } catch {
        // 次回の間隔または pagehide で再試行
      }
    },
    [roomId, isGuest, myClientId]
  );

  useEffect(() => {
    const rid = roomId?.trim();
    if (!rid) return;

    const id = setInterval(() => {
      void flushRoomChatLog({});
    }, FIVE_MIN_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void flushRoomChatLog({ keepalive: true });
      }
    };
    const onPageHide = () => void flushRoomChatLog({ keepalive: true });

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      void flushRoomChatLog({ keepalive: true });
    };
  }, [roomId, flushRoomChatLog]);
}
