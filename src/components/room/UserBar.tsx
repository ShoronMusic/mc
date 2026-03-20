'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * 参加ユーザー一覧バー（自分を表示。ゲストの場合は「名前（ゲスト）」）
 * オーナー時は「参加ユーザー」クリックで一覧表示・強制退出と AI 自由発言停止トグルを表示
 */

export interface ParticipantItem {
  clientId: string;
  displayName: string;
  /** 参加者欄で名前を表示するときの色（各自のテキスト色） */
  textColor?: string;
  /** ステータス（離席・ROM・食事中など）。名前の横に表示 */
  status?: string;
}

interface UserBarProps {
  displayName?: string;
  isGuest?: boolean;
  onMyPageClick?: () => void;
  /** オーナー時のみ。参加者一覧（自分含む） */
  participants?: ParticipantItem[];
  /** オーナー時のみ。自分の clientId（強制退出対象に含めない） */
  myClientId?: string;
  onForceExit?: (targetClientId: string, targetDisplayName: string) => void;
  /** オーナー時のみ。オーナーを別の参加者に譲る（現在在室者のみ） */
  onTransferOwner?: (newOwnerClientId: string) => void;
  /** オーナー時のみ。AI 自由発言停止がオンか */
  aiFreeSpeechStopped?: boolean;
  onAiFreeSpeechStopToggle?: () => void;
  /** 現在のオーナー clientId（王冠表示用） */
  currentOwnerClientId?: string;
  /** 今の選曲番の clientId（次の選曲者） */
  currentTurnClientId?: string;
  /** 今流れている曲を貼った人（選曲者）の clientId。参加者欄でアクティブ表示 */
  currentSongPosterClientId?: string;
  /** 他参加者名クリック時。発言欄に「〇〇さん < 」を挿入する用 */
  onParticipantClick?: (displayName: string) => void;
}

export default function UserBar({
  displayName = 'ゲスト',
  isGuest = false,
  onMyPageClick,
  participants = [],
  myClientId = '',
  onForceExit,
  onTransferOwner,
  aiFreeSpeechStopped = false,
  onAiFreeSpeechStopToggle,
  currentOwnerClientId = '',
  currentTurnClientId = '',
  currentSongPosterClientId = '',
  onParticipantClick,
}: UserBarProps) {
  const label = isGuest ? `${displayName}（ゲスト）` : displayName;
  const [showParticipants, setShowParticipants] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showParticipants) return;
    const close = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowParticipants(false);
      }
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showParticipants]);

  const isOwner = Boolean(
    myClientId && currentOwnerClientId && myClientId === currentOwnerClientId && participants.length > 0
  );
  const others = participants.filter((p) => p.clientId !== myClientId);

  const participantNamesTitle = participants.length > 0
    ? participants
        .map((p, i) => {
          const name = p.clientId === myClientId ? `${p.displayName}${isGuest ? '（ゲスト）' : ''} (自分)` : p.displayName;
          return `[${i + 1}] ${name}`;
        })
        .join(' ')
    : label;

  return (
    <div className="flex flex-wrap items-center gap-2 overflow-x-auto rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2">
      <span className="text-xs text-gray-500">参加者</span>
      {participants.length > 0 ? (
        <>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0 text-sm text-gray-200" title={participantNamesTitle}>
            {participants.map((p, i) => {
              const name = p.clientId === myClientId
                ? `${p.displayName}${isGuest ? '（ゲスト）' : ''} (自分)`
                : p.displayName;
              const color = p.textColor ?? '#e5e7eb';
              const isCurrentSongPoster = p.clientId === currentSongPosterClientId;
              return (
                <span
                  key={p.clientId}
                  className={`inline-flex items-center gap-0.5 rounded px-1 ${isCurrentSongPoster ? 'bg-amber-900/40 ring-1 ring-amber-600/50' : ''}`}
                  title={isCurrentSongPoster ? '今の曲の選曲者（再生中）' : undefined}
                >
                  <span className="text-gray-500">[{i + 1}]</span>
                  {isCurrentSongPoster && (
                    <span
                      className="animate-now-playing-wave inline-flex items-end gap-0.5 h-3"
                      style={{ transformOrigin: 'bottom' }}
                      aria-hidden
                    >
                      {[1, 2, 3, 4, 5].map((i) => (
                        <span
                          key={i}
                          className="inline-block w-0.5 rounded-full bg-amber-400"
                          style={{ height: '0.75rem', transformOrigin: 'bottom' }}
                        />
                      ))}
                    </span>
                  )}
                  {p.clientId !== myClientId && onParticipantClick ? (
                    <button
                      type="button"
                      onClick={() => onParticipantClick(p.displayName)}
                      className="cursor-pointer rounded border-0 bg-transparent p-0 text-left underline decoration-dotted underline-offset-1 hover:opacity-90"
                      style={{ color }}
                      title={`${p.displayName}さんをメンション（発言欄に挿入）`}
                    >
                      {name}
                    </button>
                  ) : (
                    <span style={{ color }}>{name}</span>
                  )}
                  {p.status && (
                    <span className="ml-0.5 text-xs text-white" title={`ステータス: ${p.status}`}>
                      [{p.status}]
                    </span>
                  )}
                </span>
              );
            })}
          </span>
          {isOwner && (
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setShowParticipants(!showParticipants)}
            className="flex items-center gap-1 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-gray-200 hover:bg-gray-700 hover:text-white"
            title="参加ユーザー一覧（オーナー）"
            aria-expanded={showParticipants}
            aria-haspopup="true"
          >
            <span className="text-amber-400" aria-hidden>👑</span>
            一覧
          </button>
          {showParticipants && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded border border-gray-600 bg-gray-800 py-1 shadow-lg">
              {participants.map((p, i) => {
                const isCurrentSongPoster = p.clientId === currentSongPosterClientId;
                const isNextTurn = p.clientId === currentTurnClientId;
                return (
                  <div
                    key={p.clientId}
                    className={`flex items-center justify-between gap-2 px-3 py-1.5 ${isCurrentSongPoster ? 'bg-amber-900/30 ring-1 ring-amber-600/50' : ''}`}
                  >
                    <span className="flex items-center gap-1.5 text-sm text-gray-200 truncate">
                      <span className="shrink-0 w-5 text-center text-xs text-gray-500" aria-label={`${i + 1}番目`}>
                        {i + 1}
                      </span>
                      {p.clientId === currentOwnerClientId && (
                        <span className="shrink-0 text-amber-400" title="チャットオーナー" aria-hidden>👑</span>
                      )}
                      {isCurrentSongPoster && (
                        <span
                          className="animate-now-playing-wave inline-flex items-end gap-0.5 h-3 shrink-0"
                          style={{ transformOrigin: 'bottom' }}
                          title="今の曲の選曲者（再生中）"
                          aria-hidden
                        >
                          {[1, 2, 3, 4, 5].map((j) => (
                            <span
                              key={j}
                              className="inline-block w-0.5 rounded-full bg-amber-400"
                              style={{ height: '0.75rem', transformOrigin: 'bottom' }}
                            />
                          ))}
                        </span>
                      )}
                      {!isCurrentSongPoster && isNextTurn && (
                        <span className="shrink-0 text-gray-400 text-xs" title="次の選曲番">次</span>
                      )}
                      <span style={{ color: p.textColor ?? '#e5e7eb' }}>{p.displayName}</span>
                      {p.status && (
                        <span className="shrink-0 text-xs text-white">[{p.status}]</span>
                      )}
                      {p.clientId === myClientId ? ' (自分)' : ''}
                    </span>
                    {p.clientId !== myClientId && (
                      <span className="flex shrink-0 items-center gap-1">
                        {onTransferOwner && (
                          <button
                            type="button"
                            onClick={() => {
                              onTransferOwner(p.clientId);
                              setShowParticipants(false);
                            }}
                            className="rounded border border-amber-600 bg-amber-900/30 px-1.5 py-0.5 text-xs text-amber-200 hover:bg-amber-800/50"
                            title={`${p.displayName}さんにオーナーを譲る`}
                          >
                            譲る
                          </button>
                        )}
                        {onForceExit && (
                          <button
                            type="button"
                            onClick={() => {
                              onForceExit(p.clientId, p.displayName);
                              setShowParticipants(false);
                            }}
                            className="rounded border border-red-700 bg-red-900/30 px-1.5 py-0.5 text-xs text-red-300 hover:bg-red-800/50"
                            title={`${p.displayName}さんを強制退出させる`}
                          >
                            強制退出
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
          )}
        </>
      ) : (
        <span className="text-sm text-gray-200">{label}</span>
      )}
      {onMyPageClick && (
        <button
          type="button"
          onClick={onMyPageClick}
          className="ml-1 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white"
          aria-label="マイページを開く"
          title="マイページ"
        >
          マイページ
        </button>
      )}
      {isOwner && onAiFreeSpeechStopToggle && (
        <button
          type="button"
          onClick={onAiFreeSpeechStopToggle}
          className={`rounded border px-2 py-1 text-xs ${
            aiFreeSpeechStopped
              ? 'border-amber-600 bg-amber-900/40 text-amber-200'
              : 'border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
          title={aiFreeSpeechStopped ? 'AI自由発言を再開' : 'AI自由発言を停止'}
        >
          AI自由発言{aiFreeSpeechStopped ? '停止中' : '停止'}
        </button>
      )}
    </div>
  );
}
