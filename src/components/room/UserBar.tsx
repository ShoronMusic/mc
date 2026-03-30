'use client';

/**
 * 参加ユーザー一覧バー。
 * - PC (lg+): 左に参加者チップ、右にマイページ・視聴履歴（従来どおり）。
 * - モバイル: 1行固定。左＝全員表示トグル、中央＝再生中の選曲者＋波形、右＝アイコン（マイページ・履歴）。
 */

import { useEffect, useState } from 'react';
import {
  UserCircleIcon,
  ClockIcon,
  UsersIcon,
  ChevronDownIcon,
  XMarkIcon,
  HeartIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { useIsLgViewport } from '@/hooks/useLgViewport';

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
  /** 途中参加者向けの「ここまでの流れ」サマリー */
  onChatSummaryClick?: () => void;
  /** いま再生中の videoId（モバイルの♡トグル用） */
  currentVideoId?: string | null;
  /** 自分がお気に入り登録した videoId 一覧（モバイルの♡点灯用） */
  favoritedVideoIds?: string[];
  /** いま再生中の曲をお気に入りトグル */
  onFavoriteCurrentClick?: (params: { videoId: string; isFavorited: boolean }) => void;
  participants?: ParticipantItem[];
  myClientId?: string;
  currentOwnerClientId?: string;
  currentSongPosterClientId?: string;
  /** 次に再生予定の曲をキュー済みの参加者（5分制限・複数人時） */
  queuedSongPublisherClientId?: string;
  /** 選曲者またはチャットオーナー: スキップが押せる見た目 */
  skipCurrentTrackActive?: boolean;
  /** 上記以外: グレーアウト（クリック不可） */
  skipCurrentTrackDisabled?: boolean;
  /** 次の選曲ターン（再生終了後に仮アクティブとして表示するため） */
  nextTurnClientId?: string;
  /** 再生末尾へシークして終了扱い（active 時のみ呼ぶ） */
  onSkipCurrentTrack?: () => void;
  onParticipantClick?: (displayName: string) => void;
}

function participantDisplayName(
  p: ParticipantItem,
  myClientId: string,
  isGuest: boolean,
): string {
  return p.clientId === myClientId
    ? `${p.displayName}${isGuest ? '（ゲスト）' : ''} (自分)`
    : p.displayName;
}

export default function UserBar({
  displayName = 'ゲスト',
  isGuest = false,
  onMyPageClick,
  onPlaybackHistoryClick,
  onChatSummaryClick,
  currentVideoId = null,
  favoritedVideoIds = [],
  onFavoriteCurrentClick,
  participants = [],
  myClientId = '',
  currentOwnerClientId = '',
  currentSongPosterClientId = '',
  queuedSongPublisherClientId = '',
  nextTurnClientId = '',
  skipCurrentTrackActive = false,
  skipCurrentTrackDisabled = false,
  onSkipCurrentTrack,
  onParticipantClick,
}: UserBarProps) {
  const isLg = useIsLgViewport();
  const [listOpen, setListOpen] = useState(false);
  const label = isGuest ? `${displayName}（ゲスト）` : displayName;

  const participantNamesTitle =
    participants.length > 0
      ? participants
          .map((p, i) => {
            const name = participantDisplayName(p, myClientId, isGuest);
            return `[${i + 1}] ${name}`;
          })
          .join(' ')
      : label;

  useEffect(() => {
    if (!listOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setListOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [listOpen]);

  const poster =
    currentSongPosterClientId !== ''
      ? participants.find((p) => p.clientId === currentSongPosterClientId)
      : undefined;

  const myPageButton =
    onMyPageClick != null ? (
      <button
        type="button"
        onClick={() => {
          setListOpen(false);
          onMyPageClick();
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700"
        aria-label="マイページを開く"
        title="マイページ"
      >
        <UserCircleIcon className="h-5 w-5" aria-hidden />
      </button>
    ) : null;

  const playbackHistoryButton =
    onPlaybackHistoryClick != null ? (
      <button
        type="button"
        onClick={() => {
          setListOpen(false);
          onPlaybackHistoryClick();
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700"
        aria-label="視聴履歴を表示"
        title="視聴履歴"
      >
        <ClockIcon className="h-5 w-5" aria-hidden />
      </button>
    ) : null;

  const chatSummaryButton =
    onChatSummaryClick != null ? (
      <button
        type="button"
        onClick={() => {
          setListOpen(false);
          onChatSummaryClick();
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700"
        aria-label="チャットサマリーを表示"
        title="チャットサマリー"
      >
        <DocumentTextIcon className="h-5 w-5" aria-hidden />
      </button>
    ) : null;

  const currentIsFavorited =
    currentVideoId != null && favoritedVideoIds.includes(currentVideoId);
  const canToggleCurrentFavorite =
    Boolean(currentVideoId) && Boolean(onFavoriteCurrentClick) && !isGuest;

  const favoriteCurrentButton =
    currentVideoId ? (
      <button
        type="button"
        onClick={() => {
          if (!currentVideoId) return;
          if (!onFavoriteCurrentClick) return;
          if (isGuest) return;
          setListOpen(false);
          onFavoriteCurrentClick({ videoId: currentVideoId, isFavorited: currentIsFavorited });
        }}
        disabled={!canToggleCurrentFavorite}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700 disabled:opacity-50 ${
          currentIsFavorited ? 'ring-1 ring-red-500/40' : ''
        }`}
        aria-label={
          isGuest
            ? 'お気に入り（ログインで利用可）'
            : currentIsFavorited
              ? 'お気に入り解除（再生中の曲）'
              : 'お気に入りに追加（再生中の曲）'
        }
        title={
          isGuest
            ? 'お気に入り（ログインで利用可）'
            : currentIsFavorited
              ? 'お気に入り解除（再生中）'
              : 'お気に入りに追加（再生中）'
        }
      >
        <HeartIcon
          className={`h-5 w-5 ${currentIsFavorited ? 'text-red-500' : 'text-gray-400'}`}
          aria-hidden
        />
      </button>
    ) : null;

  const participantChips =
    participants.length > 0 ? (
      <span
        className="flex flex-wrap items-center gap-x-1.5 gap-y-0 text-sm text-gray-200"
        title={participantNamesTitle}
      >
        {participants.map((p, i) => {
          const name = participantDisplayName(p, myClientId, isGuest);
          const color = p.textColor ?? '#e5e7eb';
          const isCurrentSongPoster = p.clientId === currentSongPosterClientId;
          const isQueuedSongPoster =
            Boolean(queuedSongPublisherClientId) && p.clientId === queuedSongPublisherClientId;
            const isNextTurnPoster =
              Boolean(nextTurnClientId) &&
              !isCurrentSongPoster &&
              !isQueuedSongPoster &&
              p.clientId === nextTurnClientId;
          const isRoomOwner = Boolean(currentOwnerClientId && p.clientId === currentOwnerClientId);
          const chipTitle = isCurrentSongPoster
            ? '今の曲の選曲者（再生中）'
            : isQueuedSongPoster
              ? '選曲済み。前の曲終了後に再生されます'
                : isNextTurnPoster
                  ? '次の選曲者（選曲待ち）'
              : undefined;
          return (
            <span
              key={p.clientId}
                className={`inline-flex flex-col items-start gap-0 rounded px-1 ${
                  isCurrentSongPoster
                    ? 'bg-amber-900/40 ring-1 ring-amber-600/50'
                    : isQueuedSongPoster
                      ? 'bg-sky-950/35 ring-1 ring-sky-700/40'
                      : isNextTurnPoster
                        ? 'bg-emerald-950/35 ring-1 ring-emerald-700/40'
                        : ''
                }`}
              title={chipTitle}
            >
              <span className="inline-flex items-center gap-0.5">
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
              {isQueuedSongPoster && (
                <span className="pl-5 text-[10px] leading-tight text-sky-300/95">選曲済み（待機中）</span>
              )}
              {isNextTurnPoster && (
                <span className="pl-5 text-[10px] leading-tight text-emerald-200/95">NEXT（選曲待ち）</span>
              )}
              {isCurrentSongPoster && skipCurrentTrackActive && onSkipCurrentTrack ? (
                <button
                  type="button"
                  onClick={onSkipCurrentTrack}
                  className="mt-0.5 rounded border border-amber-600/60 bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium leading-tight text-amber-100 hover:bg-amber-900/50"
                  aria-label="この曲を終了扱いにスキップ"
                  title="再生を最後まで進め、曲終了と同じ扱いにします"
                >
                  スキップ
                </button>
              ) : isCurrentSongPoster && skipCurrentTrackDisabled ? (
                <span
                  className="mt-0.5 inline-flex rounded border border-gray-700 bg-gray-800/50 px-2 py-0.5 text-[10px] font-medium leading-tight text-gray-500"
                  aria-hidden
                  title="選曲した方かチャットオーナーのみスキップできます"
                >
                  スキップ
                </span>
              ) : null}
            </span>
          );
        })}
      </span>
    ) : (
      <span className="flex flex-col items-start gap-1">
        <span className="text-sm text-gray-200">{label}</span>
        {skipCurrentTrackActive && onSkipCurrentTrack ? (
          <button
            type="button"
            onClick={onSkipCurrentTrack}
            className="rounded border border-amber-600/60 bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-100 hover:bg-amber-900/50"
            aria-label="この曲を終了扱いにスキップ"
            title="再生を最後まで進め、曲終了と同じ扱いにします"
          >
            スキップ
          </button>
        ) : skipCurrentTrackDisabled ? (
          <span
            className="inline-flex rounded border border-gray-700 bg-gray-800/50 px-2 py-0.5 text-[10px] font-medium text-gray-500"
            aria-hidden
            title="選曲した方かチャットオーナーのみスキップできます"
          >
            スキップ
          </span>
        ) : null}
      </span>
    );

  const desktopTrailing =
    myPageButton || playbackHistoryButton || chatSummaryButton ? (
      <div className="flex shrink-0 items-center gap-2">
        {onMyPageClick != null ? (
          <button
            type="button"
            onClick={onMyPageClick}
            className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 hover:text-white sm:px-4"
            aria-label="マイページを開く"
            title="マイページ"
          >
            マイページ
          </button>
        ) : null}
        {onPlaybackHistoryClick != null ? (
          <button
            type="button"
            onClick={onPlaybackHistoryClick}
            className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 hover:text-white"
            aria-label="視聴履歴を表示"
            title="視聴履歴を表示"
          >
            視聴履歴
          </button>
        ) : null}
        {onChatSummaryClick != null ? (
          <button
            type="button"
            onClick={onChatSummaryClick}
            className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 hover:text-white"
            aria-label="チャットサマリーを表示"
            title="途中参加者向けの流れ"
          >
            チャットサマリー
          </button>
        ) : null}
      </div>
    ) : null;

  /** モバイル: 中央の再生中ユーザー */
  const mobileCenter =
    participants.length === 0 ? (
      <div className="flex min-w-0 max-w-full flex-col items-center justify-center gap-0.5 px-0.5">
        <span className="min-w-0 truncate text-center text-sm text-gray-200">{label}</span>
        {skipCurrentTrackActive && onSkipCurrentTrack ? (
          <button
            type="button"
            onClick={onSkipCurrentTrack}
            className="shrink-0 rounded border border-amber-600/60 bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-100 hover:bg-amber-900/50"
            aria-label="この曲を終了扱いにスキップ"
            title="再生を最後まで進め、曲終了と同じ扱いにします"
          >
            スキップ
          </button>
        ) : skipCurrentTrackDisabled ? (
          <span
            className="shrink-0 rounded border border-gray-700 bg-gray-800/50 px-2 py-0.5 text-[10px] font-medium text-gray-500"
            aria-hidden
            title="選曲した方かチャットオーナーのみスキップできます"
          >
            スキップ
          </span>
        ) : null}
      </div>
    ) : poster ? (
      <div
        className="flex min-w-0 max-w-full flex-col items-center justify-center gap-0.5 px-1"
        title="今の曲の選曲者（再生中）"
      >
        <div className="flex min-w-0 max-w-full items-center justify-center gap-1.5">
          <span
            className="animate-now-playing-wave inline-flex h-3 shrink-0 items-end gap-0.5"
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
          <span className="min-w-0 truncate text-sm font-medium text-amber-100">
            {participantDisplayName(poster, myClientId, isGuest)}
          </span>
          {currentOwnerClientId && poster.clientId === currentOwnerClientId ? (
            <span className="shrink-0 text-amber-400" title="チャットオーナー" aria-label="チャットオーナー">
              👑
            </span>
          ) : null}
        </div>
        {skipCurrentTrackActive && onSkipCurrentTrack ? (
          <button
            type="button"
            onClick={onSkipCurrentTrack}
            className="shrink-0 rounded border border-amber-600/60 bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-100 hover:bg-amber-900/50"
            aria-label="この曲を終了扱いにスキップ"
            title="再生を最後まで進め、曲終了と同じ扱いにします"
          >
            スキップ
          </button>
        ) : skipCurrentTrackDisabled ? (
          <span
            className="shrink-0 rounded border border-gray-700 bg-gray-800/50 px-2 py-0.5 text-[10px] font-medium text-gray-500"
            aria-hidden
            title="選曲した方かチャットオーナーのみスキップできます"
          >
            スキップ
          </span>
        ) : null}
      </div>
    ) : nextTurnClientId ? (
      (() => {
        const nextP = participants.find((p) => p.clientId === nextTurnClientId);
        if (!nextP) return null;
        return (
          <div
            className="flex min-w-0 max-w-full flex-col items-center justify-center gap-0.5 px-1"
            title="次の選曲者（選曲待ち）"
          >
            <div className="min-w-0 truncate text-sm font-medium text-emerald-100">
              {participantDisplayName(nextP, myClientId, isGuest)}
            </div>
            <div className="text-[11px] text-emerald-200/85">選曲待ち</div>
          </div>
        );
      })()
    ) : (
      <span className="min-w-0 truncate text-center text-xs text-gray-500">再生中の選曲なし</span>
    );

  const mobileTrailing =
    favoriteCurrentButton || myPageButton || playbackHistoryButton || chatSummaryButton ? (
      <div className="flex shrink-0 items-center gap-1">
        {favoriteCurrentButton}
        {myPageButton}
        {playbackHistoryButton}
        {chatSummaryButton}
      </div>
    ) : null;

  const listOpener =
    participants.length > 0 ? (
      <button
        type="button"
        onClick={() => setListOpen(true)}
        className="flex h-9 shrink-0 items-center gap-0.5 rounded-lg border border-gray-600 bg-gray-800 px-1.5 text-gray-200 hover:bg-gray-700"
        aria-expanded={listOpen}
        aria-haspopup="dialog"
        aria-label="参加者をすべて表示"
        title="参加者一覧"
      >
        <UsersIcon className="h-5 w-5 shrink-0" aria-hidden />
        <ChevronDownIcon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
      </button>
    ) : (
      <div className="w-9 shrink-0" aria-hidden />
    );

  if (isLg) {
    return (
      <div className="flex items-center justify-between gap-3 overflow-x-auto rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-xs text-gray-500">参加者</span>
          {participantChips}
        </div>
        {desktopTrailing}
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-11 shrink-0 items-center gap-2 overflow-x-hidden overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/50 px-2 py-1">
        {listOpener}
        <div className="min-w-0 flex-1 overflow-hidden">{mobileCenter}</div>
        {mobileTrailing}
      </div>

      {listOpen && participants.length > 0 && (
        <div className="fixed inset-0 z-[80]">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="参加者一覧を閉じる"
            onClick={() => setListOpen(false)}
          />
          <div
            className="relative z-10 mx-2 mt-[max(0.5rem,env(safe-area-inset-top))] flex max-h-[min(72vh,520px)] flex-col overflow-hidden rounded-xl border border-gray-600 bg-gray-900 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-bar-participant-list-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-700 px-3 py-2.5">
              <h2 id="user-bar-participant-list-title" className="text-sm font-semibold text-gray-100">
                参加者（{participants.length}人）
              </h2>
              <button
                type="button"
                onClick={() => setListOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700"
                aria-label="閉じる"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto py-1">
              {participants.map((p, i) => {
                const name = participantDisplayName(p, myClientId, isGuest);
                const color = p.textColor ?? '#e5e7eb';
                const isCurrentSongPoster = p.clientId === currentSongPosterClientId;
                const isQueuedSongPoster =
                  Boolean(queuedSongPublisherClientId) && p.clientId === queuedSongPublisherClientId;
                const isNextTurnPoster =
                  Boolean(nextTurnClientId) &&
                  !isCurrentSongPoster &&
                  !isQueuedSongPoster &&
                  p.clientId === nextTurnClientId;
                const isRoomOwner = Boolean(currentOwnerClientId && p.clientId === currentOwnerClientId);
                return (
                  <li
                    key={p.clientId}
                    className={`flex flex-col gap-0.5 border-b border-gray-800/80 px-3 py-2.5 last:border-b-0 ${isCurrentSongPoster ? 'bg-amber-950/25' : ''} ${isQueuedSongPoster && !isCurrentSongPoster ? 'bg-sky-950/20' : ''} ${isNextTurnPoster ? 'bg-emerald-950/20' : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs text-gray-500">[{i + 1}]</span>
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
                        <span className="text-amber-400" title="チャットオーナー" aria-label="チャットオーナー">
                          👑
                        </span>
                      )}
                      {p.clientId !== myClientId && onParticipantClick ? (
                        <button
                          type="button"
                          onClick={() => {
                            onParticipantClick(p.displayName);
                            setListOpen(false);
                          }}
                          className="min-w-0 flex-1 cursor-pointer rounded border-0 bg-transparent p-0 text-left text-sm underline decoration-dotted underline-offset-2 hover:opacity-90"
                          style={{ color }}
                        >
                          {name}
                        </button>
                      ) : (
                        <span className="min-w-0 flex-1 text-sm" style={{ color }}>
                          {name}
                        </span>
                      )}
                    </div>
                    {isCurrentSongPoster && (
                      <span className="pl-6 text-[11px] text-amber-200/80">再生中の選曲</span>
                    )}
                    {isCurrentSongPoster && skipCurrentTrackActive && onSkipCurrentTrack ? (
                      <div className="pl-6 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            onSkipCurrentTrack();
                            setListOpen(false);
                          }}
                          className="rounded border border-amber-600/60 bg-amber-950/40 px-2 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-900/50"
                          aria-label="この曲を終了扱いにスキップ"
                          title="再生を最後まで進め、曲終了と同じ扱いにします"
                        >
                          スキップ
                        </button>
                      </div>
                    ) : isCurrentSongPoster && skipCurrentTrackDisabled ? (
                      <div className="pl-6 pt-0.5">
                        <span
                          className="inline-flex rounded border border-gray-700 bg-gray-800/50 px-2 py-1 text-[11px] font-medium text-gray-500"
                          aria-hidden
                          title="選曲した方かチャットオーナーのみスキップできます"
                        >
                          スキップ
                        </span>
                      </div>
                    ) : null}
                    {isQueuedSongPoster && (
                      <span className="pl-6 text-[11px] text-sky-200/85">選曲済み（待機中）</span>
                    )}
                    {isNextTurnPoster && (
                      <span className="pl-6 text-[11px] text-emerald-200/85">NEXT（選曲待ち）</span>
                    )}
                    {p.status ? (
                      <span className="pl-6 text-xs text-gray-400" title={`ステータス: ${p.status}`}>
                        [{p.status}]
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
