'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChatMessage } from '@/types/chat';
import {
  chatMessagesToLogRows,
  formatRoomChatLogTimeJst,
  mergeRoomChatLogRows,
  messageTypeLabel,
  roomChatLogScopeLabel,
  type RoomChatLogRow,
  type RoomChatLogScope,
} from '@/lib/room-chat-log-display';

type RoomChatLogModalProps = {
  open: boolean;
  onClose: () => void;
  roomId: string;
  /** 開催中会 ID があれば「今回の会」優先 */
  gatheringId?: string | null;
  /** DB 未反映の画面上メッセージ */
  liveMessages?: ChatMessage[];
  /** 非同期部屋など gathering が無いとき */
  sessionOnly?: boolean;
};

type FetchState = {
  loading: boolean;
  error: string | null;
  hint: string | null;
  scope: RoomChatLogScope;
  dateJst: string | null;
  persistedRows: RoomChatLogRow[];
  truncated: boolean;
};

function buildDownloadUrl(roomId: string, scope: RoomChatLogScope, gatheringId: string | null, dateJst: string | null): string | null {
  const q = new URLSearchParams({ roomId, download: '1' });
  if (scope === 'gathering' && gatheringId) {
    q.set('scope', 'gathering');
    q.set('gatheringId', gatheringId);
  } else if (dateJst) {
    q.set('date', dateJst);
  }
  return `/api/room-chat-log?${q.toString()}`;
}

export function RoomChatLogModal({
  open,
  onClose,
  roomId,
  gatheringId = null,
  liveMessages = [],
  sessionOnly = false,
}: RoomChatLogModalProps) {
  const [state, setState] = useState<FetchState>({
    loading: false,
    error: null,
    hint: null,
    scope: 'day',
    dateJst: null,
    persistedRows: [],
    truncated: false,
  });

  const load = useCallback(async () => {
    const rid = roomId.trim();
    if (!rid) {
      setState((s) => ({ ...s, loading: false, error: 'roomId がありません。', persistedRows: [] }));
      return;
    }

    if (sessionOnly) {
      setState({
        loading: false,
        error: null,
        hint: null,
        scope: 'session',
        dateJst: null,
        persistedRows: [],
        truncated: false,
      });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null, hint: null }));
    try {
      const q = new URLSearchParams({
        roomId: rid,
        format: 'json',
      });
      const gid = gatheringId?.trim() || '';
      if (gid) {
        q.set('scope', 'gathering');
        q.set('gatheringId', gid);
      }
      const res = await fetch(`/api/room-chat-log?${q.toString()}`, { credentials: 'include' });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        hint?: string;
        scope?: RoomChatLogScope;
        dateJst?: string;
        rows?: RoomChatLogRow[];
        truncated?: boolean;
      } | null;
      if (!res.ok) {
        setState({
          loading: false,
          error: typeof data?.error === 'string' ? data.error : 'ログの取得に失敗しました。',
          hint: typeof data?.hint === 'string' ? data.hint : null,
          scope: gid ? 'gathering' : 'day',
          dateJst: typeof data?.dateJst === 'string' ? data.dateJst : null,
          persistedRows: [],
          truncated: false,
        });
        return;
      }
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      setState({
        loading: false,
        error: null,
        hint: null,
        scope: data?.scope === 'gathering' ? 'gathering' : 'day',
        dateJst: typeof data?.dateJst === 'string' ? data.dateJst : null,
        persistedRows: rows,
        truncated: Boolean(data?.truncated),
      });
    } catch {
      setState((s) => ({
        ...s,
        loading: false,
        error: 'ログの取得に失敗しました。',
        persistedRows: [],
      }));
    }
  }, [roomId, gatheringId, sessionOnly]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const liveRows = useMemo(() => chatMessagesToLogRows(liveMessages), [liveMessages]);
  const rows = useMemo(
    () => mergeRoomChatLogRows(state.persistedRows, liveRows),
    [state.persistedRows, liveRows],
  );
  const scopeLabel = roomChatLogScopeLabel(state.scope, state.dateJst ?? undefined);
  const downloadUrl = sessionOnly
    ? null
    : buildDownloadUrl(roomId, state.scope, gatheringId ?? null, state.dateJst);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="チャットログ"
    >
      <div
        className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-sky-600/50 bg-gray-950 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sky-900/60 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white sm:text-base">チャットログ</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400 sm:text-xs">
              {scopeLabel}
              {sessionOnly ? '（保存前の表示のみ）' : ' — 保存済みログと、この画面の未反映分を表示'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded border border-sky-700/60 bg-gray-800 px-3 text-xs text-sky-100 hover:bg-gray-700 sm:text-sm"
          >
            閉じる
          </button>
        </div>

        <div className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {state.loading ? (
            <p className="text-sm text-gray-400">読み込み中…</p>
          ) : state.error ? (
            <div>
              <p className="text-sm text-amber-300">{state.error}</p>
              {state.hint ? <p className="mt-2 text-xs text-gray-500">{state.hint}</p> : null}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500">この期間のログはまだありません。</p>
          ) : (
            <ul className="space-y-2 text-xs sm:text-sm">
              {rows.map((row, i) => (
                <li
                  key={row.clientMessageId ?? `${row.createdAt}-${i}`}
                  className="rounded border border-gray-800/80 bg-gray-900/60 px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] text-gray-500 sm:text-[11px]">
                    <time dateTime={row.createdAt}>{formatRoomChatLogTimeJst(row.createdAt)}</time>
                    <span
                      className={
                        row.messageType === 'ai'
                          ? 'text-violet-300/90'
                          : row.messageType === 'system'
                            ? 'text-amber-300/90'
                            : 'text-sky-300/90'
                      }
                    >
                      [{messageTypeLabel(row.messageType)}]
                    </span>
                    <span className="font-medium text-gray-300">{row.displayName}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-gray-100">{row.body}</p>
                </li>
              ))}
            </ul>
          )}
          {state.truncated ? (
            <p className="mt-3 text-xs text-amber-300">件数上限のため古いログは省略されています。</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-800 px-4 py-2.5">
          <span className="text-[11px] text-gray-500">{rows.length} 件</span>
          {downloadUrl ? (
            <a
              href={downloadUrl}
              className="text-[11px] text-cyan-300/90 underline decoration-dotted underline-offset-2 hover:text-cyan-200 sm:text-xs"
              download
            >
              テキストでダウンロード
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
