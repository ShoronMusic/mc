'use client';

/**
 * 参加ユーザー一覧バー。
 * - PC (lg+): 左に参加者チップ、右にユーザー登録（ゲスト時のみ）・マイページ・視聴履歴など。
 * - モバイル: 1行固定。左＝全員表示トグル、中央＝再生中の選曲者＋波形、右＝アイコン（登録・マイページ・履歴など）。
 */

import { useRef } from 'react';
import {
  UserCircleIcon,
  UserPlusIcon,
  ClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HeartIcon,
  DocumentTextIcon,
  IdentificationIcon,
} from '@heroicons/react/24/outline';
import { useIsLgViewport } from '@/hooks/useLgViewport';
import { SELECTION_ROUND_SESSION_MAX_GAP_MS } from '@/lib/room-selection-round';

const AI_PARTICIPANT_CLIENT_ID = '__ai_character__';

export interface ParticipantItem {
  clientId: string;
  displayName: string;
  textColor?: string;
  status?: string;
  yellowCards?: number;
  /** 一時退席（presence オフ）で枠だけ残っている */
  isAway?: boolean;
  /** ログイン済み参加者のみ（公開プロフィール用・presence で共有） */
  authUserId?: string;
  /** マイページで公開オンのとき true */
  publicProfileVisible?: boolean;
  /** false のとき選曲順に含まれない（視聴専用） */
  participatesInSelection?: boolean;
}

interface UserBarProps {
  displayName?: string;
  isGuest?: boolean;
  /** ゲスト時のみ: 本登録を促す（マイページの左に「ユーザー登録」を出す） */
  onGuestRegisterClick?: () => void;
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
  /** 次に再生予定の曲をキュー済みの参加者（5分制限・複数人時・複数可・順不同表示） */
  queuedSongPublisherClientIds?: string[];
  /** 選曲者またはチャットオーナー: スキップが押せる見た目 */
  skipCurrentTrackActive?: boolean;
  /** 上記以外: グレーアウト（クリック不可） */
  skipCurrentTrackDisabled?: boolean;
  /** 次の選曲ターン（再生終了後に仮アクティブとして表示するため） */
  nextTurnClientId?: string;
  /** チャットオーナー基準の選曲ラウンド数（同期部屋。未指定は 1） */
  selectionRoundNumber?: number;
  /** モバイル行では Round バッジを出さない（プレイヤー側オーバーレイ表示用） */
  hideMobileRoundBadge?: boolean;
  /** 再生末尾へシークして終了扱い（active 時のみ呼ぶ） */
  onSkipCurrentTrack?: () => void;
  /** 自分の選曲予約のみ取り消し（5分制限・キュー時） */
  onCancelSongReservation?: () => void;
  onParticipantClick?: (displayName: string) => void;
  /** ログイン中の閲覧者のみ。ゲストのときはプロフィールアイコンを出さない */
  viewerIsGuest?: boolean;
  /** 参加者の公開プロフィール（authUserId がいる行のみ） */
  onParticipantPublicProfileClick?: (params: { authUserId: string; displayName: string }) => void;
}

function participantDisplayName(
  p: ParticipantItem,
  myClientId: string,
  isGuest: boolean,
): string {
  const hasGuestMarker =
    /（\s*ゲスト\s*）|\(\s*guest\s*\)|\bguest\b|ゲスト/i.test(p.displayName);
  const guestSuffix = isGuest && !hasGuestMarker ? '（ゲスト）' : '';
  return p.clientId === myClientId
    ? `${p.displayName}${guestSuffix} (自分)`
    : p.displayName;
}

function ParticipantProfileIconButton({
  participant,
  viewerIsGuest,
  onParticipantPublicProfileClick,
  onAfterClick,
}: {
  participant: ParticipantItem;
  viewerIsGuest: boolean;
  onParticipantPublicProfileClick?: (params: { authUserId: string; displayName: string }) => void;
  /** モバイル一覧を閉じるなど */
  onAfterClick?: () => void;
}) {
  const uid = participant.authUserId?.trim();
  if (!uid || participant.publicProfileVisible !== true || viewerIsGuest || !onParticipantPublicProfileClick) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onParticipantPublicProfileClick({ authUserId: uid, displayName: participant.displayName });
        onAfterClick?.();
      }}
      className="inline-flex shrink-0 items-center justify-center rounded border border-emerald-800/60 bg-emerald-950/35 p-0.5 text-emerald-200/90 hover:bg-emerald-900/45"
      title={`${participant.displayName}さんのプロフィール`}
      aria-label={`${participant.displayName}さんのプロフィール`}
    >
      <IdentificationIcon className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

export default function UserBar({
  displayName = 'ゲスト',
  isGuest = false,
  onGuestRegisterClick,
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
  queuedSongPublisherClientIds = [],
  nextTurnClientId = '',
  selectionRoundNumber = 1,
  hideMobileRoundBadge = false,
  skipCurrentTrackActive = false,
  skipCurrentTrackDisabled = false,
  onSkipCurrentTrack,
  onCancelSongReservation,
  onParticipantClick,
  viewerIsGuest = false,
  onParticipantPublicProfileClick,
}: UserBarProps) {
  const isLg = useIsLgViewport();
  const mobileParticipantScrollRef = useRef<HTMLDivElement | null>(null);
  const hasGuestMarkerInLabel =
    /（\s*ゲスト\s*）|\(\s*guest\s*\)|\bguest\b|ゲスト/i.test(displayName);
  const label = isGuest ? `${displayName}${hasGuestMarkerInLabel ? '' : '（ゲスト）'}` : displayName;
  const showGuestRegister = isGuest && onGuestRegisterClick != null;
  const gapHours = Math.round(SELECTION_ROUND_SESSION_MAX_GAP_MS / (60 * 60 * 1000));
  const roundTitle = `選曲ラウンド（ラウンド ${selectionRoundNumber}）。オーナーの番が一周して戻るたびに+1。同一ブラウザでは約${gapHours}時間以内に再入室すると続きから復元します。`;

  const participantNamesTitle =
    participants.length > 0
      ? participants
          .map((p, i) => {
            const name = participantDisplayName(p, myClientId, isGuest);
            return `[${i + 1}] ${name}`;
          })
          .join(' ')
      : label;

  const guestRegisterButtonMobile =
    showGuestRegister ? (
      <button
        type="button"
        onClick={() => {
          onGuestRegisterClick?.();
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-700/60 bg-emerald-950/40 text-emerald-100 hover:bg-emerald-900/50"
        aria-label="ユーザー登録"
        title="ユーザー登録"
      >
        <UserPlusIcon className="h-5 w-5" aria-hidden />
      </button>
    ) : null;

  const myPageButton =
    onMyPageClick != null ? (
      <button
        type="button"
        onClick={() => {
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
    currentVideoId && onFavoriteCurrentClick ? (
      <button
        type="button"
        onClick={() => {
          if (!currentVideoId) return;
          if (!onFavoriteCurrentClick) return;
          if (isGuest) return;
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

  const roundBadge =
    selectionRoundNumber >= 1 ? (
      <span
        className="inline-flex shrink-0 flex-col items-center justify-center rounded border border-amber-800/70 bg-amber-950/45 px-1.5 py-0.5 leading-none"
        title={roundTitle}
        aria-label={roundTitle}
      >
        <span className="text-[6px] font-semibold tracking-wide text-amber-200/80" aria-hidden>
          ROUND
        </span>
        <span className="mt-0.5 font-mono text-[11px] font-semibold tabular-nums text-amber-100/95">
          {selectionRoundNumber}
        </span>
      </span>
    ) : null;

  const participantChips =
    participants.length > 0 ? (
      <span
        className="flex flex-wrap items-center gap-x-1.5 gap-y-0 text-sm text-gray-200"
        title={participantNamesTitle}
      >
        {participants.map((p, i) => {
          const name = participantDisplayName(p, myClientId, isGuest);
          const away = p.isAway === true;
          const color = away ? '#9ca3af' : p.textColor ?? '#e5e7eb';
          const isAiParticipant = p.clientId === AI_PARTICIPANT_CLIENT_ID;
          const isCurrentSongPoster = p.clientId === currentSongPosterClientId;
          const isQueuedSongPoster =
            queuedSongPublisherClientIds.length > 0 &&
            queuedSongPublisherClientIds.includes(p.clientId);
            const isNextTurnPoster =
              Boolean(nextTurnClientId) &&
              !isCurrentSongPoster &&
              !isQueuedSongPoster &&
              p.clientId === nextTurnClientId;
          const isRoomOwner = Boolean(currentOwnerClientId && p.clientId === currentOwnerClientId);
          const isMyQueuedSong =
            isQueuedSongPoster && myClientId !== '' && p.clientId === myClientId;
          const chipTitle = isCurrentSongPoster
            ? '今の曲の選曲者（再生中）'
            : isQueuedSongPoster
              ? isMyQueuedSong && onCancelSongReservation
                ? '選曲予約済み。クリックで確認画面が開き、取り消せます'
                : '選曲予約済み。前の曲の終了後、順番に再生されます'
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
                  <span
                    className="hidden shrink-0 text-amber-400 lg:inline"
                    title="チャットオーナー"
                    aria-label="チャットオーナー"
                  >
                    👑
                  </span>
                )}
                {isAiParticipant && (
                  <span
                    className="inline-flex shrink-0 items-center rounded border border-violet-500/70 bg-violet-900/35 px-1 py-0 text-[9px] font-semibold leading-tight text-violet-200"
                    title="AI参加者"
                    aria-label="AI参加者"
                  >
                    AI
                  </span>
                )}
                {(p.yellowCards ?? 0) > 0 && (
                  <span className="shrink-0 text-yellow-300" title={`イエローカード ${p.yellowCards}枚`} aria-label={`イエローカード ${p.yellowCards}枚`}>
                    {'🟨'.repeat(Math.min(2, p.yellowCards ?? 0))}
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
                <ParticipantProfileIconButton
                  participant={p}
                  viewerIsGuest={viewerIsGuest}
                  onParticipantPublicProfileClick={onParticipantPublicProfileClick}
                />
                {p.status && (
                  <span className="ml-0.5 text-xs text-white" title={`ステータス: ${p.status}`}>
                    [{p.status}]
                  </span>
                )}
              </span>
              {p.participatesInSelection === false ? (
                <span className="pl-5 text-[10px] leading-tight text-gray-400" title="選曲順に含まれません">
                  視聴専用
                </span>
              ) : null}
              {isQueuedSongPoster &&
                (isMyQueuedSong && onCancelSongReservation ? (
                  <button
                    type="button"
                    onClick={onCancelSongReservation}
                    className="mt-0.5 rounded border border-sky-600/70 bg-sky-950/50 px-2 py-0.5 pl-5 text-left text-[10px] font-medium leading-tight text-sky-200 hover:bg-sky-900/55"
                    aria-label="選曲予約の取り消し（確認）"
                    title="クリックで確認画面が開き、取り消せます"
                  >
                    予約済み（順番待ち）
                  </button>
                ) : (
                  <span className="pl-5 text-[10px] leading-tight text-sky-300/95">予約済み（順番待ち）</span>
                ))}
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
    showGuestRegister || onMyPageClick != null || onPlaybackHistoryClick != null || onChatSummaryClick != null ? (
      <div className="flex shrink-0 items-center gap-2">
        {showGuestRegister ? (
          <button
            type="button"
            onClick={onGuestRegisterClick}
            className="shrink-0 rounded border border-emerald-700/60 bg-emerald-950/40 px-3 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-900/50 sm:px-4"
            aria-label="ユーザー登録"
            title="ユーザー登録"
          >
            ユーザー登録
          </button>
        ) : null}
        {onMyPageClick != null ? (
          <button
            type="button"
            onClick={onMyPageClick}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 hover:text-white sm:px-4"
            aria-label="マイページを開く"
            title="マイページ"
          >
            <UserCircleIcon className="h-4 w-4" aria-hidden />
            マイページ
          </button>
        ) : null}
        {onPlaybackHistoryClick != null ? (
          <button
            type="button"
            onClick={onPlaybackHistoryClick}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 hover:text-white"
            aria-label="視聴履歴を表示"
            title="視聴履歴を表示"
          >
            <ClockIcon className="h-4 w-4" aria-hidden />
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

  const scrollMobileParticipants = (dx: number) => {
    const el = mobileParticipantScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dx, behavior: 'smooth' });
  };

  const mobileTrailing =
    favoriteCurrentButton ||
    guestRegisterButtonMobile ||
    myPageButton ||
    playbackHistoryButton ||
    chatSummaryButton ? (
      <div className="flex shrink-0 items-center gap-1">
        {favoriteCurrentButton}
        {guestRegisterButtonMobile}
        {myPageButton}
        {playbackHistoryButton}
        {chatSummaryButton}
      </div>
    ) : null;

  if (isLg) {
    return (
      <div className="flex items-center justify-between gap-3 overflow-x-auto rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {roundBadge}
          <span className="shrink-0 text-xs text-gray-500">参加者</span>
          {participantChips}
        </div>
        {desktopTrailing}
      </div>
    );
  }

  return (
    <div className="flex min-h-11 shrink-0 items-center gap-1.5 overflow-hidden rounded-lg border border-gray-700 bg-gray-900/50 px-2 py-1">
      {!hideMobileRoundBadge ? roundBadge : null}
      <button
        type="button"
        onClick={() => scrollMobileParticipants(-180)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-600 bg-gray-800/85 text-gray-200 hover:bg-gray-700"
        aria-label="参加者を左へスクロール"
        title="左へ"
      >
        <ChevronLeftIcon className="h-4 w-4" aria-hidden />
      </button>
      <div
        ref={mobileParticipantScrollRef}
        className="mc-scrollbar-stable min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
      >
        <div className="flex min-w-max items-center gap-1 pr-1">
          {participants.length === 0 ? (
            <span className="rounded border border-gray-700 bg-gray-800/70 px-2 py-1 text-xs text-gray-400">
              参加者なし
            </span>
          ) : (
            participants.map((p, i) => {
              const name = participantDisplayName(p, myClientId, isGuest);
              const away = p.isAway === true;
              const color = away ? '#9ca3af' : p.textColor ?? '#e5e7eb';
              const isCurrentSongPoster = p.clientId === currentSongPosterClientId;
              const isQueuedSongPoster =
                queuedSongPublisherClientIds.length > 0 &&
                queuedSongPublisherClientIds.includes(p.clientId);
              const isNextTurnPoster =
                Boolean(nextTurnClientId) &&
                !isCurrentSongPoster &&
                !isQueuedSongPoster &&
                p.clientId === nextTurnClientId;
              const isRoomOwner = Boolean(currentOwnerClientId && p.clientId === currentOwnerClientId);
              const isAiParticipant = p.clientId === AI_PARTICIPANT_CLIENT_ID;
              return (
                <span
                  key={p.clientId}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                    isCurrentSongPoster
                      ? 'border-amber-600/70 bg-amber-950/45'
                      : isQueuedSongPoster
                        ? 'border-sky-700/60 bg-sky-950/35'
                        : isNextTurnPoster
                          ? 'border-emerald-700/60 bg-emerald-950/35'
                          : 'border-gray-700 bg-gray-900/70'
                  }`}
                >
                  <span className="text-[10px] text-gray-500">[{i + 1}]</span>
                  {isCurrentSongPoster ? (
                    <span className="animate-now-playing-wave inline-flex h-3 items-end gap-0.5" aria-hidden>
                      {[1, 2, 3].map((j) => (
                        <span key={j} className="inline-block w-0.5 rounded-full bg-amber-400" style={{ height: '0.7rem' }} />
                      ))}
                    </span>
                  ) : null}
                  {isAiParticipant ? (
                    <span className="inline-flex rounded border border-violet-500/70 bg-violet-900/35 px-1 text-[9px] font-semibold text-violet-200">
                      AI
                    </span>
                  ) : null}
                  {isRoomOwner ? <span className="text-amber-400">👑</span> : null}
                  {p.clientId !== myClientId && onParticipantClick ? (
                    <button
                      type="button"
                      onClick={() => onParticipantClick(p.displayName)}
                      className="underline decoration-dotted underline-offset-1"
                      style={{ color }}
                    >
                      {name}
                    </button>
                  ) : (
                    <span style={{ color }}>{name}</span>
                  )}
                  <ParticipantProfileIconButton
                    participant={p}
                    viewerIsGuest={viewerIsGuest}
                    onParticipantPublicProfileClick={onParticipantPublicProfileClick}
                  />
                </span>
              );
            })
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => scrollMobileParticipants(180)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-600 bg-gray-800/85 text-gray-200 hover:bg-gray-700"
        aria-label="参加者を右へスクロール"
        title="右へ"
      >
        <ChevronRightIcon className="h-4 w-4" aria-hidden />
      </button>
      {mobileTrailing}
    </div>
  );
}
