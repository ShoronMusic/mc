'use client';

/**
 * 参加ユーザー一覧バー。1行: 左に参加者、右にマイページ。
 * オーナー名の直後に 👑。一覧ボタン・AI停止はマイページへ。
 */

export interface ParticipantItem {
  clientId: string;
  displayName: string;
  textColor?: string;
  status?: string;
}

interface UserBarProps {
  displayName?: string;
  isGuest?: boolean;
  onMyPageClick?: () => void;
  /** モバイル等: マイページの右隣に「視聴履歴」ボタンを出す */
  onPlaybackHistoryClick?: () => void;
  participants?: ParticipantItem[];
  myClientId?: string;
  currentOwnerClientId?: string;
  currentSongPosterClientId?: string;
  onParticipantClick?: (displayName: string) => void;
}

export default function UserBar({
  displayName = 'ゲスト',
  isGuest = false,
  onMyPageClick,
  onPlaybackHistoryClick,
  participants = [],
  myClientId = '',
  currentOwnerClientId = '',
  currentSongPosterClientId = '',
  onParticipantClick,
}: UserBarProps) {
  const label = isGuest ? `${displayName}（ゲスト）` : displayName;

  const participantNamesTitle =
    participants.length > 0
      ? participants
          .map((p, i) => {
            const name =
              p.clientId === myClientId ? `${p.displayName}${isGuest ? '（ゲスト）' : ''} (自分)` : p.displayName;
            return `[${i + 1}] ${name}`;
          })
          .join(' ')
      : label;

  const participantChips =
    participants.length > 0 ? (
      <span
        className="flex flex-wrap items-center gap-x-1.5 gap-y-0 text-sm text-gray-200"
        title={participantNamesTitle}
      >
        {participants.map((p, i) => {
          const name =
            p.clientId === myClientId
              ? `${p.displayName}${isGuest ? '（ゲスト）' : ''} (自分)`
              : p.displayName;
          const color = p.textColor ?? '#e5e7eb';
          const isCurrentSongPoster = p.clientId === currentSongPosterClientId;
          const isRoomOwner = Boolean(currentOwnerClientId && p.clientId === currentOwnerClientId);
          return (
            <span
              key={p.clientId}
              className={`inline-flex items-center gap-0.5 rounded px-1 ${isCurrentSongPoster ? 'bg-amber-900/40 ring-1 ring-amber-600/50' : ''}`}
              title={isCurrentSongPoster ? '今の曲の選曲者（再生中）' : undefined}
            >
              <span className="text-gray-500">[{i + 1}]</span>
              {isCurrentSongPoster && (
                <span
                  className="animate-now-playing-wave inline-flex h-3 items-end gap-0.5"
                  style={{ transformOrigin: 'bottom' }}
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
              {isRoomOwner && (
                <span className="shrink-0 text-amber-400" title="チャットオーナー" aria-label="チャットオーナー">
                  👑
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
    ) : (
      <span className="text-sm text-gray-200">{label}</span>
    );

  const myPageButton =
    onMyPageClick ? (
      <button
        type="button"
        onClick={onMyPageClick}
        className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 hover:text-white sm:px-4"
        aria-label="マイページを開く"
        title="マイページ"
      >
        マイページ
      </button>
    ) : null;

  const playbackHistoryButton =
    onPlaybackHistoryClick ? (
      <button
        type="button"
        onClick={onPlaybackHistoryClick}
        className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 hover:text-white"
        aria-label="視聴履歴を表示"
        title="視聴履歴を表示"
      >
        視聴履歴
      </button>
    ) : null;

  const trailing =
    myPageButton || playbackHistoryButton ? (
      <div className="flex shrink-0 items-center gap-2">
        {myPageButton}
        {playbackHistoryButton}
      </div>
    ) : null;

  return (
    <div className="flex items-center justify-between gap-3 overflow-x-auto rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 text-xs text-gray-500">参加者</span>
        {participantChips}
      </div>
      {trailing}
    </div>
  );
}
