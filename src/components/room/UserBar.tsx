'use client';

/**
 * 参加ユーザー一覧バー。
 * - PC (lg+): 左に参加者チップ、右にユーザー登録（ゲスト時のみ）・マイページ・視聴履歴など。
 * - モバイル: 1行固定。左＝全員表示トグル、中央＝再生中の選曲者＋波形、右＝アイコン（登録・マイページ・履歴など）。
 */

import {
  UserCircleIcon,
  UserPlusIcon,
  ClockIcon,
  HeartIcon,
  DocumentTextIcon,
  IdentificationIcon,
} from '@heroicons/react/24/outline';
import {
  favoriteHeartActiveRingSoftClass,
  favoriteHeartActiveTextClass,
} from '@/lib/favorite-heart-ui';
import { useIsLgViewport } from '@/hooks/useLgViewport';
import {
  IS_MC_PRODUCT,
  favoriteHeartIdleIconClass,
  participantMentionBtnClass,
  participantProfileIconBtnClass,
  roomToolbarIconBtnClass,
  roomUserBarShellClass,
} from '@/lib/product-branding';
import { participantChatColorForSurface } from '@/lib/chat-text-color';
import { SELECTION_ROUND_SESSION_MAX_GAP_MS } from '@/lib/room-selection-round';

const AI_PARTICIPANT_CLIENT_ID = '__ai_character__';

function participantChipStateClass(
  isCurrentSongPoster: boolean,
  isQueuedSongPoster: boolean,
  isPassTurnReserved: boolean,
  isNextTurnPoster: boolean,
  mobile = false,
): string {
  if (IS_MC_PRODUCT) {
    if (isCurrentSongPoster) {
      return mobile
        ? 'border-amber-300 bg-amber-50'
        : 'bg-amber-50 ring-1 ring-amber-300/80';
    }
    if (isQueuedSongPoster) {
      return mobile ? 'border-sky-300 bg-sky-50' : 'bg-sky-50 ring-1 ring-sky-300/80';
    }
    if (isPassTurnReserved) {
      return mobile ? 'border-violet-300 bg-violet-50' : 'bg-violet-50 ring-1 ring-violet-300/80';
    }
    if (isNextTurnPoster) {
      return mobile ? 'border-green-300 bg-green-50' : 'bg-green-50 ring-1 ring-green-300/80';
    }
    return mobile ? 'border-gray-200 bg-gray-50' : '';
  }
  if (isCurrentSongPoster) {
    return mobile
      ? 'border-amber-600/70 bg-amber-950/45'
      : 'bg-amber-900/40 ring-1 ring-amber-600/50';
  }
  if (isQueuedSongPoster) {
    return mobile ? 'border-sky-700/60 bg-sky-950/35' : 'bg-sky-950/35 ring-1 ring-sky-700/40';
  }
  if (isPassTurnReserved) {
    return mobile ? 'border-violet-700/60 bg-violet-950/35' : 'bg-violet-950/35 ring-1 ring-violet-700/40';
  }
  if (isNextTurnPoster) {
    return mobile ? 'border-emerald-700/60 bg-emerald-950/35' : 'bg-emerald-950/35 ring-1 ring-emerald-700/40';
  }
  return mobile ? 'border-gray-700 bg-gray-900/70' : '';
}

function participantIndexClass(): string {
  return 'text-gray-500';
}

function participantSubLabelClass(kind: 'queued' | 'pass' | 'next' | 'watchOnly'): string {
  if (IS_MC_PRODUCT) {
    if (kind === 'queued') return 'text-sky-700';
    if (kind === 'pass') return 'text-violet-700';
    if (kind === 'next') return 'text-green-700';
    return 'text-gray-500';
  }
  if (kind === 'queued') return 'text-sky-300/95';
  if (kind === 'pass') return 'text-violet-200/95';
  if (kind === 'next') return 'text-emerald-200/95';
  return 'text-gray-400';
}

function userBarShellClass(): string {
  return roomUserBarShellClass(false);
}

function userBarShellClassMobile(): string {
  return roomUserBarShellClass(true);
}

function desktopSecondaryBtnClass(disabled = false): string {
  if (IS_MC_PRODUCT) {
    const base =
      'inline-flex shrink-0 items-center gap-1 rounded border px-3 py-2 text-sm font-medium sm:px-4';
    return disabled
      ? `${base} cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 opacity-70`
      : `${base} border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100`;
  }
  return disabled
    ? 'inline-flex shrink-0 items-center gap-1 rounded border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm font-medium text-gray-500 cursor-not-allowed sm:px-4'
    : 'inline-flex shrink-0 items-center gap-1 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 hover:text-white sm:px-4';
}

function participantDisplayTextClass(away: boolean, inactive = false): string {
  if (!IS_MC_PRODUCT) {
    return inactive ? 'text-gray-500' : '';
  }
  if (inactive) return 'font-medium text-gray-400';
  return away ? 'font-medium text-gray-500' : 'font-medium text-gray-900';
}

function isHumanParticipant(clientId: string): boolean {
  return clientId !== AI_PARTICIPANT_CLIENT_ID;
}

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
  /** ログイン同一アカウント: この端末が操作端末 */
  selfSessionActive?: boolean;
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
  /** 次の選曲ターンで自動パスする参加者 */
  passTurnReservationClientIds?: string[];
  /** 選曲者またはチャットオーナー: スキップが押せる見た目 */
  skipCurrentTrackActive?: boolean;
  /** 上記以外: グレーアウト（クリック不可） */
  skipCurrentTrackDisabled?: boolean;
  /** ライブラリ／PL 連続再生中（「次曲へ」表示用） */
  playlistAutoplayActive?: boolean;
  /** 連続再生の次曲へ（キューは維持） */
  onSkipPlaylistTrack?: () => void;
  /**
   * 連続再生中の曲ジャンプモーダルを開く（ライブラリ／再生リスト共通）。
   * `playlistSongPickLabel` でボタン表記を切り替える。
   */
  onOpenPlaylistSongPick?: () => void;
  /** 「ライブラリ」または「再生リスト」 */
  playlistSongPickLabel?: string;
  /** 次の選曲ターン（再生終了後に仮アクティブとして表示するため） */
  nextTurnClientId?: string;
  /** チャットオーナー基準の選曲ラウンド数（同期部屋。未指定は 1） */
  selectionRoundNumber?: number;
  /** モバイル行では Round バッジを出さない（プレイヤー側オーバーレイ表示用） */
  hideMobileRoundBadge?: boolean;
  /** 再生末尾へシークして終了扱い（active 時のみ呼ぶ） */
  onSkipCurrentTrack?: () => void;
  /** 自分の選曲予約のみ管理（5分制限・キュー時） */
  onManageSongReservation?: () => void;
  /** チャットオーナー: 任意の参加者を次の選曲者として指名 */
  onOwnerPickSelector?: () => void;
  /** オーナー不在時の協調役による代理指名 */
  ownerPickSelectorActing?: boolean;
  /** オーナー復帰待ち（5分猶予中） */
  ownerAbsentGrace?: boolean;
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
  if (p.clientId === myClientId) {
    const selfLabel = p.selfSessionActive ? ' (自分・操作中)' : ' (自分)';
    return `${p.displayName}${guestSuffix}${selfLabel}`;
  }
  return p.displayName;
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
  if (!uid || viewerIsGuest || !onParticipantPublicProfileClick) {
    return null;
  }
  const hasVisibleProfile = participant.publicProfileVisible === true;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onParticipantPublicProfileClick({ authUserId: uid, displayName: participant.displayName });
        onAfterClick?.();
      }}
      className={participantProfileIconBtnClass(hasVisibleProfile)}
      title={
        hasVisibleProfile
          ? `${participant.displayName}さんのプロフィール`
          : `${participant.displayName}さん（プロフィール未公開）`
      }
      aria-label={`${participant.displayName}さんのプロフィール`}
    >
      {hasVisibleProfile ? (
        <IdentificationIcon className="h-5 w-5" aria-hidden />
      ) : (
        <UserCircleIcon className="h-5 w-5" aria-hidden />
      )}
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
  passTurnReservationClientIds = [],
  nextTurnClientId = '',
  selectionRoundNumber = 1,
  hideMobileRoundBadge = false,
  skipCurrentTrackActive = false,
  skipCurrentTrackDisabled = false,
  playlistAutoplayActive = false,
  onSkipPlaylistTrack,
  onOpenPlaylistSongPick,
  playlistSongPickLabel = 'ライブラリ',
  onSkipCurrentTrack,
  onManageSongReservation,
  onOwnerPickSelector,
  ownerPickSelectorActing = false,
  ownerAbsentGrace = false,
  onParticipantClick,
  viewerIsGuest = false,
  onParticipantPublicProfileClick,
}: UserBarProps) {
  const isLg = useIsLgViewport();
  const hasGuestMarkerInLabel =
    /（\s*ゲスト\s*）|\(\s*guest\s*\)|\bguest\b|ゲスト/i.test(displayName);
  const label = isGuest ? `${displayName}${hasGuestMarkerInLabel ? '' : '（ゲスト）'}` : displayName;
  const showGuestRegister = isGuest && onGuestRegisterClick != null;
  const gapHours = Math.round(SELECTION_ROUND_SESSION_MAX_GAP_MS / (60 * 60 * 1000));
  const roundTitle = `選曲ラウンド（ラウンド ${selectionRoundNumber}）。オーナーの番が一周して戻るたびに+1。オーナー引継ぎでは維持し、新しい会が始まると1から。同一ブラウザでは約${gapHours}時間以内に再入室すると続きから復元します。`;

  /** 在室の人間ユーザーが1人だけ（AI・退席中は除く） */
  const soleHumanInRoom =
    participants.filter((p) => isHumanParticipant(p.clientId) && p.isAway !== true).length <= 1;

  const skipTrackButtons = (opts: { forCurrentPoster: boolean; className?: string }) => {
    if (!opts.forCurrentPoster) return null;
    const wrapClass = opts.className ?? 'mt-0.5 flex flex-wrap items-center gap-1';
    const songPickLabel = playlistSongPickLabel.trim() || 'ライブラリ';
    const libraryBtnActive =
      playlistAutoplayActive && skipCurrentTrackActive && onOpenPlaylistSongPick ? (
        <button
          type="button"
          onClick={onOpenPlaylistSongPick}
          className="rounded border border-sky-600/70 bg-sky-950/45 px-2 py-0.5 text-[10px] font-medium leading-tight text-sky-100 hover:bg-sky-900/55"
          aria-label={`${songPickLabel}の曲リストを開く`}
          title={`${songPickLabel}の曲リストから前の曲や別の曲を指定して再生します`}
        >
          {songPickLabel}
        </button>
      ) : null;
    const libraryBtnDisabled =
      playlistAutoplayActive && skipCurrentTrackDisabled && onOpenPlaylistSongPick ? (
        <span
          className="inline-flex rounded border border-gray-700 bg-gray-800/50 px-2 py-0.5 text-[10px] font-medium leading-tight text-gray-500"
          aria-hidden
          title="選曲した方かチャットオーナーのみ使えます"
        >
          {songPickLabel}
        </span>
      ) : null;
    const nextBtn =
      playlistAutoplayActive && skipCurrentTrackActive && onSkipPlaylistTrack ? (
        <button
          type="button"
          onClick={onSkipPlaylistTrack}
          className="rounded border border-lime-600/70 bg-lime-950/45 px-2 py-0.5 text-[10px] font-medium leading-tight text-lime-100 hover:bg-lime-900/55"
          aria-label="連続再生の次の曲へスキップ"
          title="ライブラリ／プレイリストの次の曲へ進みます（連続再生は続行）"
        >
          次曲へ
        </button>
      ) : null;
    if (skipCurrentTrackActive && onSkipCurrentTrack) {
      return (
        <span className={wrapClass}>
          {libraryBtnActive}
          {nextBtn}
          <button
            type="button"
            onClick={onSkipCurrentTrack}
            className="rounded border border-amber-600/60 bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium leading-tight text-amber-100 hover:bg-amber-900/50"
            aria-label={
              playlistAutoplayActive
                ? '連続再生を終了してスキップ'
                : 'この曲を終了扱いにスキップ'
            }
            title={
              playlistAutoplayActive
                ? '連続再生を止め、選曲ターンへ進みます'
                : '再生を最後まで進め、曲終了と同じ扱いにします'
            }
          >
            スキップ
          </button>
        </span>
      );
    }
    if (skipCurrentTrackDisabled) {
      return (
        <span className={wrapClass}>
          {libraryBtnDisabled}
          {playlistAutoplayActive ? (
            <span
              className="inline-flex rounded border border-gray-700 bg-gray-800/50 px-2 py-0.5 text-[10px] font-medium leading-tight text-gray-500"
              aria-hidden
              title="選曲した方かチャットオーナーのみ使えます"
            >
              次曲へ
            </span>
          ) : null}
          <span
            className="inline-flex rounded border border-gray-700 bg-gray-800/50 px-2 py-0.5 text-[10px] font-medium leading-tight text-gray-500"
            aria-hidden
            title="選曲した方かチャットオーナーのみスキップできます"
          >
            スキップ
          </span>
        </span>
      );
    }
    if (libraryBtnActive || nextBtn) {
      return (
        <span className={wrapClass}>
          {libraryBtnActive}
          {nextBtn}
        </span>
      );
    }
    return null;
  };

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
        className={
          IS_MC_PRODUCT
            ? 'mc-accent-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border'
            : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-700/60 bg-emerald-950/40 text-emerald-100 hover:bg-emerald-900/50'
        }
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
        className={roomToolbarIconBtnClass()}
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
        className={roomToolbarIconBtnClass()}
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
        className={roomToolbarIconBtnClass()}
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
        className={roomToolbarIconBtnClass(
          `disabled:opacity-50 ${currentIsFavorited ? favoriteHeartActiveRingSoftClass : ''}`,
        )}
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
          className={`h-5 w-5 ${currentIsFavorited ? favoriteHeartActiveTextClass : favoriteHeartIdleIconClass()}`}
          aria-hidden
        />
      </button>
    ) : null;

  const roundBadge =
    selectionRoundNumber >= 1 ? (
      <span
        className={
          IS_MC_PRODUCT
            ? 'inline-flex shrink-0 flex-col items-center justify-center rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 leading-none'
            : 'inline-flex shrink-0 flex-col items-center justify-center rounded border border-amber-800/70 bg-amber-950/45 px-1.5 py-0.5 leading-none'
        }
        title={roundTitle}
        aria-label={roundTitle}
      >
        <span
          className={
            IS_MC_PRODUCT
              ? 'text-[6px] font-semibold tracking-wide text-gray-500'
              : 'text-[6px] font-semibold tracking-wide text-amber-200/80'
          }
          aria-hidden
        >
          ROUND
        </span>
        <span
          className={
            IS_MC_PRODUCT
              ? 'mt-0.5 font-mono text-[11px] font-semibold tabular-nums text-gray-800'
              : 'mt-0.5 font-mono text-[11px] font-semibold tabular-nums text-amber-100/95'
          }
        >
          {selectionRoundNumber}
        </span>
      </span>
    ) : null;

  const participantChips =
    participants.length > 0 ? (
      <span
        className={`flex flex-wrap items-center gap-x-1.5 gap-y-0 text-sm ${
          IS_MC_PRODUCT ? 'text-gray-800' : 'text-gray-200'
        }`}
        title={participantNamesTitle}
      >
        {participants.map((p, i) => {
          const name = participantDisplayName(p, myClientId, isGuest);
          const away = p.isAway === true;
          const color = participantChatColorForSurface(
            away ? '#9ca3af' : p.textColor,
            '#e5e7eb',
          );
          const isAiParticipant = p.clientId === AI_PARTICIPANT_CLIENT_ID;
          const isCurrentSongPoster = p.clientId === currentSongPosterClientId;
          const isQueuedSongPoster =
            queuedSongPublisherClientIds.length > 0 &&
            queuedSongPublisherClientIds.includes(p.clientId);
          const isPassTurnReserved =
            passTurnReservationClientIds.length > 0 &&
            passTurnReservationClientIds.includes(p.clientId);
            const isNextTurnPoster =
              Boolean(nextTurnClientId) &&
              !isCurrentSongPoster &&
              !isQueuedSongPoster &&
              !isPassTurnReserved &&
              p.clientId === nextTurnClientId;
          const isRoomOwner = Boolean(currentOwnerClientId && p.clientId === currentOwnerClientId);
          const isMyQueuedSong =
            isQueuedSongPoster && myClientId !== '' && p.clientId === myClientId;
          const chipTitle = isCurrentSongPoster
            ? '今の曲の選曲者（再生中）'
            : isQueuedSongPoster
              ? isMyQueuedSong && onManageSongReservation
                ? '選曲済み。クリックで予約内容の確認・取り消し'
                : '選曲済み。前の曲の終了後、順番に再生されます'
              : isPassTurnReserved
                ? 'パス予約済み。自分の番が来たら自動でパスします'
              : isNextTurnPoster
                ? '次の選曲者（選曲待ち）'
                : undefined;
          return (
            <span
              key={p.clientId}
                className={`inline-flex flex-col items-start gap-0 rounded px-1 ${participantChipStateClass(
                  isCurrentSongPoster,
                  isQueuedSongPoster,
                  isPassTurnReserved,
                  isNextTurnPoster,
                )}`}
              title={chipTitle}
            >
              <span className="inline-flex items-center gap-0.5">
                <span className={participantIndexClass()}>[{i + 1}]</span>
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
                    className={`hidden shrink-0 lg:inline ${IS_MC_PRODUCT ? 'text-amber-600' : 'text-amber-400'}`}
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
                {p.clientId !== myClientId && onParticipantClick && !soleHumanInRoom ? (
                  <button
                    type="button"
                    onClick={() => onParticipantClick(p.displayName)}
                    className={`${participantMentionBtnClass()} ${participantDisplayTextClass(away)}`}
                    style={IS_MC_PRODUCT ? undefined : { color }}
                    title={`${p.displayName}さんをメンション（発言欄に挿入）`}
                  >
                    {name}
                  </button>
                ) : (
                  <span
                    className={participantDisplayTextClass(away, p.clientId !== myClientId && soleHumanInRoom)}
                    style={IS_MC_PRODUCT ? undefined : { color }}
                  >
                    {name}
                  </span>
                )}
                <ParticipantProfileIconButton
                  participant={p}
                  viewerIsGuest={viewerIsGuest}
                  onParticipantPublicProfileClick={onParticipantPublicProfileClick}
                />
                {p.status && (
                  <span
                    className={`ml-0.5 text-xs ${IS_MC_PRODUCT ? 'text-gray-600' : 'text-white'}`}
                    title={`ステータス: ${p.status}`}
                  >
                    [{p.status}]
                  </span>
                )}
              </span>
              {p.participatesInSelection === false ? (
                <span
                  className={`pl-5 text-[10px] leading-tight ${participantSubLabelClass('watchOnly')}`}
                  title="選曲順に含まれません"
                >
                  視聴専用
                </span>
              ) : null}
              {isQueuedSongPoster &&
                (isMyQueuedSong && onManageSongReservation ? (
                  <button
                    type="button"
                    onClick={onManageSongReservation}
                    className="mt-0.5 rounded border border-sky-600/70 bg-sky-950/50 px-2 py-0.5 pl-5 text-left text-[10px] font-medium leading-tight text-sky-200 hover:bg-sky-900/55"
                    aria-label="選曲予約の確認・取り消し"
                    title="クリックで予約内容の確認・取り消し"
                  >
                    選曲済み
                  </button>
                ) : (
                  <span className={`pl-5 text-[10px] leading-tight ${participantSubLabelClass('queued')}`}>
                    選曲済み
                  </span>
                ))}
              {isPassTurnReserved ? (
                <span className={`pl-5 text-[10px] leading-tight ${participantSubLabelClass('pass')}`}>
                  パス予約
                </span>
              ) : null}
              {isNextTurnPoster && (
                <span className={`pl-5 text-[10px] leading-tight ${participantSubLabelClass('next')}`}>
                  NEXT（選曲待ち）
                </span>
              )}
              {skipTrackButtons({ forCurrentPoster: isCurrentSongPoster })}
            </span>
          );
        })}
      </span>
    ) : (
      <span className="flex flex-col items-start gap-1">
        <span className={`text-sm ${IS_MC_PRODUCT ? 'text-gray-800' : 'text-gray-200'}`}>{label}</span>
        {skipTrackButtons({ forCurrentPoster: true })}
      </span>
    );

  const desktopTrailing =
    showGuestRegister ||
    onOwnerPickSelector != null ||
    onMyPageClick != null ||
    onPlaybackHistoryClick != null ||
    onChatSummaryClick != null ? (
      <div className="flex shrink-0 items-center gap-2">
        {onOwnerPickSelector != null ? (
          <button
            type="button"
            onClick={onOwnerPickSelector}
            disabled={soleHumanInRoom}
            className={desktopSecondaryBtnClass(soleHumanInRoom)}
            aria-label={ownerPickSelectorActing ? '選曲者指名（オーナー代理）' : '選曲者指名'}
            title={
              soleHumanInRoom
                ? '他の参加者がいるときに使えます'
                : ownerPickSelectorActing
                  ? 'オーナー不在中の代理として、任意の参加者を次の選曲者として指名'
                  : '任意の参加者を次の選曲者として指名'
            }
          >
            選曲者指名{ownerPickSelectorActing ? '（代理）' : ''}
          </button>
        ) : null}
        {ownerAbsentGrace ? (
          <span
            className="hidden shrink-0 rounded border border-amber-800/50 bg-amber-950/35 px-2 py-1 text-[11px] text-amber-200/90 lg:inline"
            title="オーナー復帰待ち（5分以内に復帰がなければ引き継ぎ）"
          >
            オーナー不在
          </span>
        ) : null}
        {showGuestRegister ? (
          <button
            type="button"
            onClick={onGuestRegisterClick}
            className={
              IS_MC_PRODUCT
                ? 'mc-accent-primary shrink-0 rounded border px-3 py-2 text-sm font-medium sm:px-4'
                : 'shrink-0 rounded border border-emerald-700/60 bg-emerald-950/40 px-3 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-900/50 sm:px-4'
            }
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
            className={desktopSecondaryBtnClass()}
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
            className={desktopSecondaryBtnClass()}
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
            className={desktopSecondaryBtnClass()}
            aria-label="チャットサマリーを表示"
            title="途中参加者向けの流れ"
          >
            チャットサマリー
          </button>
        ) : null}
      </div>
    ) : null;

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
      <div className={userBarShellClass()}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {roundBadge}
          <span className={`shrink-0 text-xs ${IS_MC_PRODUCT ? 'font-medium text-gray-700' : 'text-gray-500'}`}>
            参加者
          </span>
          {participantChips}
        </div>
        {desktopTrailing}
      </div>
    );
  }

  return (
    <div className={userBarShellClassMobile()}>
      {!hideMobileRoundBadge ? roundBadge : null}
      <div className="mc-scrollbar-stable min-w-0 flex-1 overflow-y-auto max-h-[5.5rem]">
        <div className="flex flex-wrap items-start gap-1 pr-0.5">
          {participants.length === 0 ? (
            <span
              className={`rounded border px-2 py-1 text-xs ${
                IS_MC_PRODUCT
                  ? 'border-gray-200 bg-gray-50 text-gray-600'
                  : 'border-gray-700 bg-gray-800/70 text-gray-400'
              }`}
            >
              参加者なし
            </span>
          ) : (
            participants.map((p, i) => {
              const name = participantDisplayName(p, myClientId, isGuest);
              const away = p.isAway === true;
              const color = participantChatColorForSurface(
                away ? '#9ca3af' : p.textColor,
                '#e5e7eb',
              );
              const isCurrentSongPoster = p.clientId === currentSongPosterClientId;
              const isQueuedSongPoster =
                queuedSongPublisherClientIds.length > 0 &&
                queuedSongPublisherClientIds.includes(p.clientId);
              const isPassTurnReserved =
                passTurnReservationClientIds.length > 0 &&
                passTurnReservationClientIds.includes(p.clientId);
              const isNextTurnPoster =
                Boolean(nextTurnClientId) &&
                !isCurrentSongPoster &&
                !isQueuedSongPoster &&
                !isPassTurnReserved &&
                p.clientId === nextTurnClientId;
              const isRoomOwner = Boolean(currentOwnerClientId && p.clientId === currentOwnerClientId);
              const isAiParticipant = p.clientId === AI_PARTICIPANT_CLIENT_ID;
              const isMyQueuedSong =
                isQueuedSongPoster && myClientId !== '' && p.clientId === myClientId;
              const chipTitle = isCurrentSongPoster
                ? '今の曲の選曲者（再生中）'
                : isQueuedSongPoster
                  ? isMyQueuedSong && onManageSongReservation
                    ? '選曲済み。タップで確認・取り消し'
                    : '選曲済み'
                  : isPassTurnReserved
                    ? 'パス予約済み'
                    : isNextTurnPoster
                      ? '次の選曲者'
                      : undefined;
              return (
                <span
                  key={p.clientId}
                  className={`inline-flex max-w-full flex-col items-start gap-0 rounded border px-1.5 py-1 text-xs ${participantChipStateClass(
                    isCurrentSongPoster,
                    isQueuedSongPoster,
                    isPassTurnReserved,
                    isNextTurnPoster,
                    true,
                  )}`}
                  title={chipTitle}
                >
                  <span className="inline-flex max-w-full items-center gap-1">
                    <span className={`shrink-0 text-[10px] ${participantIndexClass()}`}>[{i + 1}]</span>
                    {isCurrentSongPoster ? (
                      <span
                        className="animate-now-playing-wave inline-flex h-3 shrink-0 items-end gap-0.5"
                        aria-hidden
                      >
                        {[1, 2, 3].map((j) => (
                          <span
                            key={j}
                            className="inline-block w-0.5 rounded-full bg-amber-400"
                            style={{ height: '0.7rem' }}
                          />
                        ))}
                      </span>
                    ) : null}
                    {isAiParticipant ? (
                      <span className="inline-flex shrink-0 rounded border border-violet-500/70 bg-violet-900/35 px-1 text-[9px] font-semibold text-violet-200">
                        AI
                      </span>
                    ) : null}
                    {isRoomOwner ? (
                      <span className={`shrink-0 ${IS_MC_PRODUCT ? 'text-amber-600' : 'text-amber-400'}`}>
                        👑
                      </span>
                    ) : null}
                    {p.clientId !== myClientId && onParticipantClick && !soleHumanInRoom ? (
                      <button
                        type="button"
                        onClick={() => onParticipantClick(p.displayName)}
                        className={`min-w-0 truncate ${participantMentionBtnClass()} ${participantDisplayTextClass(away)}`}
                        style={IS_MC_PRODUCT ? undefined : { color }}
                      >
                        {name}
                      </button>
                    ) : (
                      <span
                        className={`min-w-0 truncate ${participantDisplayTextClass(away, p.clientId !== myClientId && soleHumanInRoom)}`}
                        style={IS_MC_PRODUCT ? undefined : { color }}
                      >
                        {name}
                      </span>
                    )}
                    <ParticipantProfileIconButton
                      participant={p}
                      viewerIsGuest={viewerIsGuest}
                      onParticipantPublicProfileClick={onParticipantPublicProfileClick}
                    />
                  </span>
                  {isQueuedSongPoster &&
                    (isMyQueuedSong && onManageSongReservation ? (
                      <button
                        type="button"
                        onClick={onManageSongReservation}
                        className="mt-0.5 rounded border border-sky-600/70 bg-sky-950/50 px-2 py-0.5 text-[10px] font-medium leading-tight text-sky-200 hover:bg-sky-900/55"
                        aria-label="選曲予約の確認・取り消し"
                      >
                        選曲済み
                      </button>
                    ) : (
                      <span className={`mt-0.5 text-[10px] leading-tight ${participantSubLabelClass('queued')}`}>
                        選曲済み
                      </span>
                    ))}
                  {isPassTurnReserved ? (
                    <span className={`mt-0.5 text-[10px] leading-tight ${participantSubLabelClass('pass')}`}>
                      パス予約
                    </span>
                  ) : null}
                  {isNextTurnPoster ? (
                    <span className={`mt-0.5 text-[10px] leading-tight ${participantSubLabelClass('next')}`}>
                      NEXT
                    </span>
                  ) : null}
                  {skipTrackButtons({ forCurrentPoster: isCurrentSongPoster })}
                </span>
              );
            })
          )}
        </div>
      </div>
      {mobileTrailing}
    </div>
  );
}
