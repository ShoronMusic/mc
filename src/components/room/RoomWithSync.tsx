'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChannel, usePresence, usePresenceListener } from 'ably/react';
import Chat from '@/components/chat/Chat';
import ChatInput, { type ChatInputHandle } from '@/components/chat/ChatInput';
import YouTubePlayer, {
  type YouTubePlayerHandle,
  YT_PLAYER_STATE_BUFFERING,
  YT_PLAYER_STATE_ENDED,
  YT_PLAYER_STATE_PLAYING,
} from '@/components/player/YouTubePlayer';
import { GuestRegisterPromptModal } from '@/components/auth/GuestRegisterPromptModal';
import MyPage from '@/components/mypage/MyPage';
import RoomMainLayout from '@/components/room/RoomMainLayout';
import RoomPlaybackHistory from '@/components/room/RoomPlaybackHistory';
import { SiteFeedbackModal } from '@/components/room/SiteFeedbackModal';
import UserBar from '@/components/room/UserBar';
import ParticipantPublicProfileModal from '@/components/room/ParticipantPublicProfileModal';
import { getLastExitStorageKey } from '@/components/providers/AblyProviderWrapper';
import {
  checkSendLimit,
  getSendLimitMessage,
  updateSendTimestamps,
} from '@/lib/chat-limits';
import {
  CHAT_TEXT_COLOR_STORAGE_KEY,
  DEFAULT_CHAT_TEXT_COLOR,
} from '@/lib/chat-text-color';
import { readJoinEntryChimeEnabled } from '@/lib/participant-join-announcements-preference';
import { USER_SONG_HISTORY_UPDATED_EVENT } from '@/lib/user-song-history-events';
import { NON_YOUTUBE_URL_SYSTEM_MESSAGE } from '@/lib/chat-non-youtube-url';
import {
  SYSTEM_MESSAGE_COMMENTARY_FETCH_FAILED,
  SYSTEM_MESSAGE_JP_NO_COMMENTARY,
  SYSTEM_MESSAGE_QUEUE_SONG_DEFERRED,
  buildAiQuestionGuardSoftDeclineMessage,
  shouldShowJpNoCommentarySystemMessage,
} from '@/lib/chat-system-copy';
import {
  buildTurnOrderClarificationReply,
  isAiTurnOrderClarificationText,
} from '@/lib/ai-turn-order-clarification';
import { resolveAiQuestionMusicRelated } from '@/lib/client-ai-question-guard-resolve';
import { isDevMinimalSongAi } from '@/lib/dev-minimal-song-ai';
import { COMMENT_PACK_MAX_FREE_COMMENTS } from '@/lib/song-tidbits';
import { playbackLog } from '@/lib/playback-debug';
import { useResumeYoutubeWhenTabVisible } from '@/hooks/useResumeYoutubeWhenTabVisible';
import { rememberRoomForGuideReturn } from '@/lib/safe-return-path';
import { extractVideoId, isStandaloneNonYouTubeUrl } from '@/lib/youtube';
import { isYoutubeKeywordSearchEnabled } from '@/lib/youtube-keyword-search-ui';
import {
  type PlaybackMessage,
  type PlaybackHistoryUpdatedPayload,
  PLAYBACK_HISTORY_UPDATED_EVENT,
  PLAYBACK_SNAPSHOT_EVENT,
  REQUEST_PLAYBACK_SYNC_EVENT,
} from '@/types/playback';
import {
  CHAT_MESSAGE_EVENT,
  type ChatMessage,
  type ChatMessagePayload,
  type SystemMessageOptions,
} from '@/types/chat';
import {
  OWNER_FORCE_EXIT_EVENT,
  OWNER_SET_PARTICIPANT_SELECTION_EVENT,
  OWNER_AI_FREE_SPEECH_STOP_EVENT,
  OWNER_COMMENT_PACK_MODE_EVENT,
  OWNER_JP_AI_UNLOCK_EVENT,
  OWNER_AI_QUESTION_GUARD_EVENT,
  OWNER_STATE_EVENT,
  TURN_STATE_EVENT,
  OWNER_5MIN_LIMIT_EVENT,
  type OwnerForceExitPayload,
  type OwnerSetParticipantSelectionPayload,
  type OwnerAiFreeSpeechStopPayload,
  type OwnerCommentPackModePayload,
  type OwnerJpAiUnlockPayload,
  type OwnerAiQuestionGuardPayload,
  type OwnerStatePayload,
  type TurnStatePayload,
  type Owner5MinLimitPayload,
} from '@/types/room-owner';
import {
  canonicalCommentPackSlots,
  commentPackSlotsEqual,
  DEFAULT_COMMENT_PACK_SLOTS,
  type CommentPackSlotSelection,
  equivalentBaseOnlySlots,
  isCommentPackFullyOff,
  normalizeCommentPackSlotsFromRequestBody,
} from '@/lib/comment-pack-slots';
import { formatMusic8ModeratorIntroPrefix } from '@/lib/music8-moderator-chat-prefix';
import {
  computeNextSelectionRound,
  getSelectablePresentRing,
  persistSelectionRound,
  readPersistedSelectionRound,
  type SelectionRoundParticipant,
} from '@/lib/room-selection-round';
import {
  setKicked,
  setKickedSitewide,
  clearAiQuestionWarnStorage,
  clearKickedStorageForRoom,
  clearKickedSitewideStorage,
  OWNER_ABSENCE_MS,
  getOwnerStateFromStorage,
  setOwnerStateToStorage,
  getCommentPackModeFromStorage,
  setCommentPackModeToStorage,
} from '@/lib/room-owner';
import { createClient } from '@/lib/supabase/client';
import { DocumentTextIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { useIsLgViewport } from '@/hooks/useLgViewport';
import { useRoomChatLogPersistence } from '@/hooks/useRoomChatLogPersistence';
import { useSupabaseAuthUserId } from '@/hooks/useSupabaseAuthUserId';
import { isAiQuestionGuardKickExemptUserId } from '@/lib/ai-question-guard-exempt-user-ids';
import { lineFromJoinGreetingApi } from '@/lib/join-greeting-logic';

const AI_DISPLAY_NAME = 'AI';
const SILENCE_TIDBIT_SEC = 30;
/** 他メンバーの「再生」で巻き戻ししない閾値（秒）。有料/無料で広告の有無により終了時刻がずれるため、遅れた再生は適用しない */
const PLAY_SYNC_REWIND_THRESHOLD_SEC = 10;
const AUTO_PLAY_POLL_MS = 50;
const AUTO_PLAY_GIVE_UP_MS = 8000;
const JOIN_CHIME_AUDIO_PATH = '/audio/success-chime.mp3';
const LEAVE_CHIME_AUDIO_PATH = '/audio/close.mp3';
/** 入室・退室チャイムの再生音量（0〜1）。従来 0.85 は大きめだったため控えめに */
const JOIN_LEAVE_CHIME_VOLUME = 0.32;

/** 入室・退室 SE の検証用。本番で使うときは .env.local に NEXT_PUBLIC_DEBUG_JOIN_LEAVE_CHIME=1 */
const JOIN_LEAVE_CHIME_DEBUG =
  process.env.NEXT_PUBLIC_DEBUG_JOIN_LEAVE_CHIME === '1' ||
  process.env.NODE_ENV === 'development';

function chimeDebug(...args: unknown[]): void {
  if (!JOIN_LEAVE_CHIME_DEBUG) return;
  // eslint-disable-next-line no-console -- 意図的な検証ログ
  console.log('[mc:join-leave-chime]', ...args);
}

function playJoinChimeClip(): void {
  chimeDebug('▶ play JOIN', { src: JOIN_CHIME_AUDIO_PATH });
  try {
    const audio = new Audio(JOIN_CHIME_AUDIO_PATH);
    audio.volume = JOIN_LEAVE_CHIME_VOLUME;
    void audio.play().catch((e) => {
      chimeDebug('JOIN play() rejected', e);
    });
  } catch (e) {
    chimeDebug('JOIN Audio constructor failed', e);
  }
}

function playLeaveChimeClip(): void {
  chimeDebug('▶ play LEAVE', { src: LEAVE_CHIME_AUDIO_PATH });
  try {
    const audio = new Audio(LEAVE_CHIME_AUDIO_PATH);
    audio.volume = JOIN_LEAVE_CHIME_VOLUME;
    void audio.play().catch((e) => {
      chimeDebug('LEAVE play() rejected', e);
    });
  } catch (e) {
    chimeDebug('LEAVE Audio constructor failed', e);
  }
}

/** パス・次へ・飛ばして・キープなど、選曲をスキップする旨の発言か */
function isPassPhrase(body: string): boolean {
  const t = body.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (/^パス!?します?\.?$/.test(t) || /^パス\s*!?\.?$/.test(t)) return true;
  if (/^キャンセル\.?$/.test(t)) return true;
  if (/^一回休み\.?$/.test(t)) return true;
  if (lower === 'pass') return true;
  if (/^次(いって|行って)(ください)?\.?$/.test(t)) return true;
  if (/^次に(いって|行って)(ください)?\.?$/.test(t)) return true;
  if (/^飛ばして(ください)?\.?$/.test(t)) return true;
  if (/^スキップ\.?$/.test(lower)) return true;
  if (/^スキップして(くれ)?(ください)?\.?$/.test(t)) return true;
  if (/^キープ(して)?(ください)?\.?$/.test(t)) return true;
  return false;
}

/** 離席・ROM（無言）の意思表明か。Gemini への通常チャット API は呼ばない（挨拶は出さない） */
function isLeaveOrRomPhrase(body: string): boolean {
  const t = body.trim();
  if (!t) return false;
  const normalized = t.replace(/\s+/g, '');
  if (/席(を)?外す/.test(normalized) || /離席/.test(normalized)) return true;
  if (/トイレ|お手洗い/.test(normalized)) return true;
  if (/食事して(くる|ます)/.test(normalized) || /ご飯(に)?行ってくる/.test(normalized)) return true;
  if (/(お?風呂|お?ふろ)(入って)?くる/.test(normalized)) return true;
  if (/^(また)?ROM(する|る)?(ね)?\.?$/i.test(normalized) || /^ROM(する|る)(ね)?\.?$/i.test(normalized)) return true;
  if (/無言(する|ね)?\.?$/.test(normalized) || /^黙る(ね)?\.?$/.test(normalized)) return true;
  if (/いってくる(ね)?\.?$/.test(normalized) && t.length <= 20) return true;
  return false;
}

/** 時間帯に応じた挨拶（参加者入室時） */
function getTimeBasedGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'おはようございます';
  if (h >= 11 && h < 17) return 'こんにちは';
  return 'こんばんは';
}

/** AIの第一声（参加者への部屋の説明） */
const AI_FIRST_VOICE =
  '洋楽好きで一緒に楽しむチャットの部屋です。参加者が順番にYouTubeから曲を貼って一緒に鑑賞します。投稿する動画は洋楽の曲・MV・ライブ映像など音楽コンテンツに限ってください（洋楽以外の動画は控えてください）。洋楽ならジャンルや時代は自由です。よろしくお願いします！';
/** 選曲順の説明 */
const TURN_ORDER_VOICE =
  '入室した順で、選曲に参加している方から曲を貼っていきます（視聴専用の方は順番に含めず案内も飛ばします）。退席から30分以内は枠と選曲順を維持し、ターン案内は在室の方へ進みます（予約曲は順番どおり再生されます）。';
const TIDBIT_COOLDOWN_SEC = 60;
/** presence から落ちた直後も、入室順の枠を残す時間（選曲順・表示順の土台を維持） */
const VACANT_SLOT_RETENTION_MS = 30 * 60 * 1000;

function createMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** comment-pack の tidbit UUID（JSON で string 以外が来るケースも許容） */
function parseTidbitIdFromPack(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') {
    const s = v.trim();
    return s.length > 0 ? s : undefined;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

interface PresenceMemberData {
  displayName?: string;
  /** ログイン済みのみ。公開プロフィール照会用（ゲストは送らない） */
  authUserId?: string;
  /** マイページで公開オンなら true */
  publicProfileVisible?: boolean;
  /** 選曲に参加するか。false なら視聴専用。デフォルト true */
  participatesInSelection?: boolean;
  /** チャットでの自分のテキスト色（参加者欄の名前色に反映） */
  textColor?: string;
  /** 自分のステータス（離席・ROM・食事中など）。参加者名横に表示 */
  status?: string;
  /** オーナー設定: 邦楽AI解説解禁（セッション設定） */
  jpAiUnlockEnabled?: boolean;
  /**
   * このクライアントがこの部屋に presence を出し始めた時刻（並び順用）。
   * updateStatus で名前・色が変わっても変えない（Ably の timestamp は更新のたびに進むため並びが崩れるのを防ぐ）。
   */
  joinedAtMs?: number;
}

/** presence 落ち直後の空席枠（クライアント間で共有せず、各クライアントが presence 差分から同じ結果を再構成） */
interface VacantParticipantSlot {
  departedAtMs: number;
  sortKey: number;
  displayName: string;
  participatesInSelection: boolean;
  textColor?: string;
}

interface LastKnownPresenceSnapshot {
  displayName: string;
  participatesInSelection: boolean;
  textColor?: string;
  sortKey: number;
}

interface CandidateSong {
  videoId: string;
  title: string;
  channelTitle: string;
  artistTitle: string;
  thumbnailUrl?: string;
  addedAt: number;
  /** 候補リストから「貼った」ことがあるか（日時） */
  usedAt?: number;
}

/** Hook 依存配列から外す（再生成不要の定数） */
const SEC_AFTER_END_BEFORE_PROMPT = 30;
const DEFAULT_DURATION_WHEN_UNKNOWN_SEC = 240;
const FIVE_MIN_MS = 5 * 60 * 1000;

interface RoomWithSyncProps {
  displayName?: string;
  channelName: string;
  roomId?: string;
  roomTitle?: string;
  roomDisplayTitle?: string;
  isGuest?: boolean;
  onLeave?: () => void;
  clientId?: string;
}

export default function RoomWithSync({
  displayName: displayNameProp = 'ゲスト',
  channelName,
  roomId,
  roomTitle = '',
  roomDisplayTitle = '',
  isGuest = false,
  onLeave,
  clientId: myClientId = '',
}: RoomWithSyncProps) {
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const applyingRemoteRef = useRef(false);
  /** ブラウザでは setInterval の戻り値は number（Node の Timeout 型と食い違うため number で保持） */
  const autoPlayAfterChangeVideoRef = useRef<number | null>(null);
  /** 再生開始が取りこぼされたときの短期リトライ用ポーリング */
  const ensurePlayRetryRef = useRef<number | null>(null);
  /** scheduleAutoPlay が直近に play を publish した時刻（YT の PLAYING で二重 publish しない） */
  const lastScheduledPlayPublishAtRef = useRef(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomDisplayTitleCurrent, setRoomDisplayTitleCurrent] = useState(roomDisplayTitle);
  useRoomChatLogPersistence(roomId, messages, { isGuest, myClientId });
  useEffect(() => {
    rememberRoomForGuideReturn(roomId);
  }, [roomId]);
  const [myPageOpen, setMyPageOpen] = useState(false);
  const [publicProfileVisible, setPublicProfileVisible] = useState(false);
  const [participantPublicProfileModal, setParticipantPublicProfileModal] = useState<{
    userId: string;
    displayName: string;
  } | null>(null);
  const [guestRegisterModalOpen, setGuestRegisterModalOpen] = useState(false);
  const [playbackHistoryModalOpen, setPlaybackHistoryModalOpen] = useState(false);
  const [chatSummaryModalOpen, setChatSummaryModalOpen] = useState(false);
  const [chatSummaryLoading, setChatSummaryLoading] = useState(false);
  const [chatSummaryError, setChatSummaryError] = useState<string | null>(null);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [siteFeedbackOpen, setSiteFeedbackOpen] = useState(false);
  const [cancelReservationModalOpen, setCancelReservationModalOpen] = useState(false);
  const [policyTab, setPolicyTab] = useState<'terms' | 'privacy' | 'guide'>('terms');
  useEffect(() => {
    setRoomDisplayTitleCurrent(roomDisplayTitle);
  }, [roomDisplayTitle]);

  useEffect(() => {
    if (isGuest) {
      setChatStyleAdminTools(false);
      return;
    }
    let cancelled = false;
    void fetch('/api/session/chat-style-admin', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { chatStyleAdmin?: boolean }) => {
        if (cancelled) return;
        setChatStyleAdminTools(d?.chatStyleAdmin === true);
      })
      .catch(() => {
        if (!cancelled) setChatStyleAdminTools(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isGuest]);
  const [chatSummary, setChatSummary] = useState<{
    summaryText: string;
    sessionWindowLabel: string;
    participants?: string[];
    participantSongCounts?: { displayName: string; count: number }[];
    eraDistribution?: { era: string; count: number }[];
    styleDistribution?: { style: string; count: number }[];
    popularArtists?: { artist: string; count: number }[];
    popularTracks?: { artist: string; title: string; count: number }[];
  } | null>(null);
  const isLg = useIsLgViewport();
  const [userTextColor, setUserTextColor] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_CHAT_TEXT_COLOR;
    try {
      const saved = localStorage.getItem(CHAT_TEXT_COLOR_STORAGE_KEY);
      return saved && /^#[0-9a-fA-F]{6}$/.test(saved) ? saved : DEFAULT_CHAT_TEXT_COLOR;
    } catch {
      return DEFAULT_CHAT_TEXT_COLOR;
    }
  });
  const lastActivityAtRef = useRef(Date.now());
  const lastTidbitAtRef = useRef(0);
  const videoIdRef = useRef<string | null>(null);
  const hasUserSentMessageRef = useRef(false);
  const pendingSongQueryRef = useRef<string | null>(null);
  const pendingSongConfirmationTextRef = useRef<string | null>(null);
  /** messages の先頭から何件まで入退室音を処理済みか（末尾だけ見ると同一tickで別メッセージに負けるため） */
  const joinChimeScannedLenRef = useRef(0);
  const nextPromptShownForVideoIdRef = useRef<string | null>(null);
  const initialGreetingDoneRef = useRef(false);
  /** 現在再生中の曲を貼った人の clientId（次の曲促しを誰が出すか） */
  const lastChangeVideoPublisherRef = useRef('');
  const fiveMinLimitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const songLimit5MinEnabledRef = useRef(true);
  /** いま再生中の曲がこのクライアントで開始扱いになった時刻（複数人・5分キュー用） */
  const currentTrackStartedAtMsRef = useRef(0);
  /** YT ended 直後のみ true 扱いに近づける。終了後も videoId が残るため 5 分待ちが誤って予約扱いになるのを防ぐ */
  const trackEndedGraceWindowUntilRef = useRef(0);
  const TRACK_ENDED_GRACE_MS = 25_000;
  const pendingQueuedVideoIdRef = useRef<string | null>(null);
  const pendingQueuedPublisherRef = useRef('');
  /** 5分待ち中の選曲予約（FIFO）。各 publisherClientId は同時に1件まで */
  const songReservationQueueRef = useRef<{ videoId: string; publisherClientId: string }[]>([]);
  const playbackEndedApplyRef = useRef<() => void>(() => {});
  /** 選曲キュー: 投稿者の ended が来ないとき最古参加者が遅延で適用するタイマー */
  const playbackQueueFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSendAtRef = useRef(0);
  const sendTimestampsRef = useRef<number[]>([]);
  const playbackHistoryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 遅延入室の再生問い合わせを短時間に連打しない（presence 更新でタイマーが何度も張り直されるため） */
  const lastPlaybackSyncRequestAtRef = useRef(0);
  const [playbackHistoryRefreshKey, setPlaybackHistoryRefreshKey] = useState(0);
  /** スキップ押下後、その動画IDではボタンを出さない（選曲者・オーナー各自のクライアント） */
  const [skipUsedForVideoId, setSkipUsedForVideoId] = useState<string | null>(null);
  /** 5分制限キューで選曲予約中の参加者（参加者欄のステータス用・複数可） */
  const [queuedSongPublisherClientIds, setQueuedSongPublisherClientIds] = useState<string[]>([]);

  const syncSongReservationQueueHead = useCallback(() => {
    const q = songReservationQueueRef.current;
    const head = q[0];
    if (head) {
      pendingQueuedVideoIdRef.current = head.videoId;
      pendingQueuedPublisherRef.current = head.publisherClientId;
    } else {
      pendingQueuedVideoIdRef.current = null;
      pendingQueuedPublisherRef.current = '';
    }
    setQueuedSongPublisherClientIds(q.map((e) => e.publisherClientId));
  }, []);
  const [favoritedVideoIds, setFavoritedVideoIds] = useState<string[]>([]);
  const [chatStyleAdminTools, setChatStyleAdminTools] = useState(false);
  const recentlyUsedTidbitIdsRef = useRef<string[]>([]);
  const tidbitCountSinceUserMessageRef = useRef(0);
  const lastEndedVideoIdForTidbitRef = useRef<string | null>(null);
  /** 曲解説表示後の自由発言でメインアーティスト優先にする残り回数（1〜2回） */
  const tidbitPreferMainArtistLeftRef = useRef(0);
  /** comment-pack を表示した動画ID。次の曲まで同じ曲の豆知識を出さず一般豆知識にする（重複解説を防ぐ） */
  const commentPackVideoIdRef = useRef<string | null>(null);
  /** comment-pack の自由コメントを遅延表示するタイマー（次の曲案内で必ずクリア） */
  const freeCommentTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** 自由コメント待ちの間は一般豆知識を抑止 */
  const suppressTidbitRef = useRef(false);
  /** （邦楽）選曲アナウンス後〜次の曲が貼られるまで AI 発言を止める対象の videoId */
  const jpDomesticSilenceVideoIdRef = useRef<string | null>(null);
  /** 自分が発言したか（ステータスありでも発言あれば在席とみなして豆知識を出す） */
  const hasCurrentUserSentMessageSinceLastTidbitRef = useRef(false);
  const [aiFreeSpeechStopped, setAiFreeSpeechStopped] = useState(true);
  const [yellowCardByClientId, setYellowCardByClientId] = useState<Record<string, number>>({});
  const [ownerState, setOwnerState] = useState<{ ownerClientId: string; ownerLeftAt: number | null }>(() =>
    roomId ? getOwnerStateFromStorage(roomId) ?? { ownerClientId: '', ownerLeftAt: null } : { ownerClientId: '', ownerLeftAt: null }
  );
  const ownerStatePublishRef = useRef(false);
  const currentTurnClientIdRef = useRef('');
  const participatingOrderRef = useRef<
    { clientId: string; displayName: string; participatesInSelection: boolean }[]
  >([]);
  /** ターン計算用の入室順一覧（視聴専用が輪にいないときの次候補に使う） */
  const participantsForTurnRef = useRef<
    { clientId: string; participatesInSelection: boolean; isAway?: boolean }[]
  >([]);
  /** ターン案内・changeVideo: リング上で次の「在室かつ選曲参加」の clientId */
  const resolveNextPresentTurnRef = useRef<(afterClientId: string) => string>(() => '');
  /** 入室順のフォールバック（古いクライアントが joinedAtMs を送らない場合）＋ ref 更新後に participants を再計算する */
  const joinOrderByClientIdRef = useRef<Map<string, number>>(new Map());
  const [joinOrderEpoch, setJoinOrderEpoch] = useState(0);
  const lastKnownByClientIdRef = useRef<Map<string, LastKnownPresenceSnapshot>>(new Map());
  const prevPresenceIdsRef = useRef<Set<string>>(new Set());
  const [vacantByClientId, setVacantByClientId] = useState<Record<string, VacantParticipantSlot>>({});
  const presentClientIdsRef = useRef<Set<string>>(new Set());
  const lastPresenceRoomIdRef = useRef<string | null>(null);
  /** この部屋で presence を出し始めた時刻（並び用・部屋が変わったらリセット） */
  const roomPresenceJoinedAtMsRef = useRef<number | null>(null);
  if (lastPresenceRoomIdRef.current !== roomId) {
    lastPresenceRoomIdRef.current = roomId ?? null;
    joinOrderByClientIdRef.current.clear();
    roomPresenceJoinedAtMsRef.current = null;
    lastKnownByClientIdRef.current.clear();
    prevPresenceIdsRef.current = new Set();
  }
  /** ゲスト用の表示名（マイページで変更可能）。非ゲストは displayNameProp をそのまま使う */
  const [guestDisplayName, setGuestDisplayName] = useState(displayNameProp);
  const effectiveDisplayName = isGuest ? guestDisplayName : displayNameProp;
  const authUserId = useSupabaseAuthUserId(isGuest);

  useEffect(() => {
    if (isGuest || !authUserId) {
      setPublicProfileVisible(false);
      return;
    }
    let cancelled = false;
    const loadPublicProfileVisibility = async () => {
      try {
        const r = await fetch('/api/user/public-profile', { credentials: 'include' });
        const d = (await r.json().catch(() => null)) as { visibleInRooms?: boolean } | null;
        if (!cancelled) setPublicProfileVisible(d?.visibleInRooms === true);
      } catch {
        if (!cancelled) setPublicProfileVisible(false);
      }
    };
    void loadPublicProfileVisibility();
    return () => {
      cancelled = true;
    };
  }, [isGuest, authUserId, myPageOpen]);
  /** 選曲に参加するか。false なら視聴専用。デフォルト true */
  const [participatesInSelection, setParticipatesInSelection] = useState(true);
  const [joinEntryChimeEnabled, setJoinEntryChimeEnabled] = useState(true);
  useEffect(() => {
    setJoinEntryChimeEnabled(readJoinEntryChimeEnabled());
  }, []);
  /** 今誰の選曲番か（clientId）。空は未定・曲0本時など */
  const [currentTurnClientId, setCurrentTurnClientId] = useState('');
  /** チャットオーナー基準の選曲ラウンド（在室メンバーが一周してアンカーに戻るたび +1） */
  const selectionRoundNumberRef = useRef(1);
  const [selectionRoundNumber, setSelectionRoundNumber] = useState(1);
  const prevOwnerForRoundRef = useRef('');
  const lastRoundRoomIdRef = useRef('');
  /** 今流れている曲を貼った人（選曲者）の clientId。参加者欄でアクティブ表示 */
  const [currentSongPosterClientId, setCurrentSongPosterClientId] = useState('');
  /** オーナーによる5分制限。デフォルトON。そのセッションのみ */
  const [songLimit5MinEnabled, setSongLimit5MinEnabled] = useState(true);
  /** オーナーによる曲紹介スロット [基本, ヒット/受賞, 歌詞, サウンド]（部屋ID単位で localStorage に保持） */
  const [commentPackSlots, setCommentPackSlots] = useState<CommentPackSlotSelection>(() => {
    if (typeof window === 'undefined') return DEFAULT_COMMENT_PACK_SLOTS;
    const rid = roomId?.trim();
    if (!rid) return DEFAULT_COMMENT_PACK_SLOTS;
    return canonicalCommentPackSlots(getCommentPackModeFromStorage(rid) ?? DEFAULT_COMMENT_PACK_SLOTS);
  });
  const commentPackSlotsRef = useRef<CommentPackSlotSelection>(DEFAULT_COMMENT_PACK_SLOTS);
  /** 曲紹介スロットの最終適用時刻（Ably の遅延・順不同で古い設定が戻るのを防ぐ） */
  const commentPackSlotsSentAtRef = useRef(0);
  /** オーナーによる「邦楽AI解説の解禁」設定（デフォルトOFF） */
  const [jpAiUnlockEnabled, setJpAiUnlockEnabled] = useState(false);
  const jpAiUnlockEnabledRef = useRef(false);
  commentPackSlotsRef.current = commentPackSlots;
  jpAiUnlockEnabledRef.current = jpAiUnlockEnabled;
  songLimit5MinEnabledRef.current = songLimit5MinEnabled;
  videoIdRef.current = videoId;
  playingRef.current = playing;
  useResumeYoutubeWhenTabVisible(playerRef, videoIdRef, playingRef);
  /** 自分のステータス（離席・ROM・食事中など）。参加者名横に表示 */
  const [userStatus, setUserStatus] = useState('');
  /** 自分専用の「次に貼りたい曲」候補リスト（ブラウザ内保存） */
  const candidateStorageKey =
    typeof window !== 'undefined'
      ? `room_candidate_songs_${roomId || 'default'}`
      : 'room_candidate_songs_default';
  const [candidateSongs, setCandidateSongs] = useState<CandidateSong[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(candidateStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as CandidateSong[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((c) => typeof c?.videoId === 'string');
    } catch {
      return [];
    }
  });
  const [candidateOpen, setCandidateOpen] = useState(false);
  /** AI_TIDBIT_MODERATOR_USER_IDS に含まれるログインユーザーのみ true（NG ボタン） */
  const [canRejectTidbit, setCanRejectTidbit] = useState(false);

  const candidateSongsRef = useRef<CandidateSong[]>(candidateSongs);
  useEffect(() => {
    candidateSongsRef.current = candidateSongs;
  }, [candidateSongs]);

  /** 部屋切替・再入室時に曲紹介スロットを localStorage から復元 */
  useEffect(() => {
    const rid = roomId?.trim();
    if (!rid) return;
    commentPackSlotsSentAtRef.current = 0;
    const s = canonicalCommentPackSlots(getCommentPackModeFromStorage(rid) ?? DEFAULT_COMMENT_PACK_SLOTS);
    commentPackSlotsRef.current = s;
    setCommentPackSlots(s);
  }, [roomId]);

  useEffect(() => {
    if (isGuest) {
      setCanRejectTidbit(false);
      return;
    }
    let cancelled = false;
    const loadModerator = () => {
      fetch('/api/tidbit-moderator-check', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled) return;
          if (d && typeof d.canRejectTidbit === 'boolean') setCanRejectTidbit(d.canRejectTidbit);
        })
        .catch(() => {
          if (!cancelled) setCanRejectTidbit(false);
        });
    };
    loadModerator();
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') loadModerator();
    };
    document.addEventListener('visibilitychange', onVis);

    const sb = createClient();
    const { data: authSub } = sb
      ? sb.auth.onAuthStateChange(() => {
          if (!cancelled) loadModerator();
        })
      : { data: { subscription: { unsubscribe: () => {} } } };

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      authSub.subscription.unsubscribe();
    };
  }, [isGuest]);

  const [candidateButtonFlash, setCandidateButtonFlash] = useState(false);
  const candidateButtonFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerCandidateButtonFlash = useCallback(() => {
    setCandidateButtonFlash(true);
    if (candidateButtonFlashTimeoutRef.current) clearTimeout(candidateButtonFlashTimeoutRef.current);
    candidateButtonFlashTimeoutRef.current = setTimeout(() => {
      setCandidateButtonFlash(false);
      candidateButtonFlashTimeoutRef.current = null;
    }, 900);
  }, []);

  /** プレビュー中だけメイン再生音量を落とす */
  const previewActiveRef = useRef(false);
  const volumeBeforePreviewRef = useRef<number>(100);
  const handlePreviewStart = useCallback((videoId: string) => {
    void videoId;
    if (previewActiveRef.current) return;
    previewActiveRef.current = true;
    try {
      const cur = playerRef.current?.getVolume?.();
      volumeBeforePreviewRef.current = typeof cur === 'number' ? cur : 100;
      playerRef.current?.setVolume(0);
    } catch {
      // noop
    }
  }, []);
  const handlePreviewStop = useCallback(() => {
    if (!previewActiveRef.current) return;
    previewActiveRef.current = false;
    try {
      playerRef.current?.setVolume(volumeBeforePreviewRef.current ?? 100);
    } catch {
      // noop
    }
  }, []);

  if (roomPresenceJoinedAtMsRef.current === null) {
    roomPresenceJoinedAtMsRef.current = Date.now();
  }

  const presencePayload: PresenceMemberData = useMemo(
    () => ({
      displayName: effectiveDisplayName,
      ...(authUserId && authUserId.trim() ? { authUserId: authUserId.trim() } : {}),
      ...(authUserId ? { publicProfileVisible } : {}),
      participatesInSelection,
      textColor: userTextColor,
      status: userStatus || undefined,
      jpAiUnlockEnabled,
      joinedAtMs: roomPresenceJoinedAtMsRef.current ?? undefined,
    }),
    [
      effectiveDisplayName,
      authUserId,
      publicProfileVisible,
      participatesInSelection,
      userTextColor,
      userStatus,
      jpAiUnlockEnabled,
    ],
  );
  const { updateStatus } = usePresence(channelName, presencePayload);
  const { presenceData } = usePresenceListener<PresenceMemberData>(channelName);
  presentClientIdsRef.current = new Set(presenceData.map((p) => p.clientId));

  useEffect(() => {
    setVacantByClientId({});
  }, [roomId]);

  useEffect(() => {
    updateStatus(presencePayload);
  }, [updateStatus, presencePayload]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(candidateStorageKey, JSON.stringify(candidateSongs));
    } catch {
      // ignore
    }
  }, [candidateSongs, candidateStorageKey]);
  // presenceData の初回登場を記録（joinedAtMs 非対応クライアント向け）。退席中も入室順キーは空席解除まで残す。
  useEffect(() => {
    let mapChanged = false;
    presenceData.forEach((p) => {
      const id = p.clientId;
      if (!joinOrderByClientIdRef.current.has(id)) {
        joinOrderByClientIdRef.current.set(id, typeof p.timestamp === 'number' ? p.timestamp : 0);
        mapChanged = true;
      }
    });
    if (mapChanged) setJoinOrderEpoch((e) => e + 1);
  }, [presenceData]);

  useEffect(() => {
    const now = Date.now();
    const currentIds = new Set(presenceData.map((p) => p.clientId));
    const prev = prevPresenceIdsRef.current;
    let joinPruned = false;

    setVacantByClientId((v0) => {
      let next = v0;
      let changed = false;
      const ensureCopy = () => {
        if (next === v0) next = { ...v0 };
      };

      for (const [id, slot] of Object.entries(next)) {
        if (now - slot.departedAtMs > VACANT_SLOT_RETENTION_MS) {
          ensureCopy();
          delete next[id];
          joinOrderByClientIdRef.current.delete(id);
          joinPruned = true;
          changed = true;
        }
      }

      currentIds.forEach((id) => {
        if (next[id]) {
          ensureCopy();
          delete next[id];
          changed = true;
        }
      });

      prev.forEach((id) => {
        if (!currentIds.has(id)) {
          const known = lastKnownByClientIdRef.current.get(id);
          if (known && !(id in next)) {
            ensureCopy();
            next[id] = {
              departedAtMs: now,
              sortKey: known.sortKey,
              displayName: known.displayName,
              participatesInSelection: known.participatesInSelection,
              ...(known.textColor ? { textColor: known.textColor } : {}),
            };
            changed = true;
          }
        }
      });

      return changed ? next : v0;
    });

    if (joinPruned) setJoinOrderEpoch((e) => e + 1);

    presenceData.forEach((p) => {
      const d = p.data as PresenceMemberData | undefined;
      const j = d?.joinedAtMs;
      const sortKey =
        typeof j === 'number' && Number.isFinite(j)
          ? j
          : joinOrderByClientIdRef.current.get(p.clientId) ??
            (typeof p.timestamp === 'number' ? p.timestamp : 0);
      lastKnownByClientIdRef.current.set(p.clientId, {
        displayName: (d?.displayName ?? 'ゲスト').trim() || 'ゲスト',
        participatesInSelection: d?.participatesInSelection !== false,
        textColor:
          typeof d?.textColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(d.textColor)
            ? d.textColor
            : undefined,
        sortKey,
      });
    });

    prevPresenceIdsRef.current = new Set(currentIds);
  }, [presenceData]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const now = Date.now();
      let joinPruned = false;
      setVacantByClientId((v0) => {
        let next = v0;
        let changed = false;
        const ensureCopy = () => {
          if (next === v0) next = { ...v0 };
        };
        for (const [id, slot] of Object.entries(next)) {
          if (now - slot.departedAtMs > VACANT_SLOT_RETENTION_MS) {
            ensureCopy();
            delete next[id];
            joinOrderByClientIdRef.current.delete(id);
            joinPruned = true;
            changed = true;
          }
        }
        return changed ? next : v0;
      });
      if (joinPruned) setJoinOrderEpoch((e) => e + 1);
    }, 60_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const presenceIds = new Set(presenceData.map((p) => p.clientId));
    const now = Date.now();
    const allowed = new Set([
      ...Array.from(presenceIds),
      ...Object.entries(vacantByClientId)
        .filter(([, s]) => now - s.departedAtMs <= VACANT_SLOT_RETENTION_MS)
        .map(([id]) => id),
    ]);
    setYellowCardByClientId((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([id]) => allowed.has(id)));
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [presenceData, vacantByClientId]);

  const participants = useMemo(() => {
    void joinOrderEpoch;
    const now = Date.now();
    const sortKeyForPresence = (p: (typeof presenceData)[number]) => {
      const d = p.data as PresenceMemberData | undefined;
      const j = d?.joinedAtMs;
      if (typeof j === 'number' && Number.isFinite(j)) return j;
      return joinOrderByClientIdRef.current.get(p.clientId) ?? (p.timestamp ?? 0);
    };

    const presentRows = [...presenceData]
      .sort((a, b) => {
        const at = sortKeyForPresence(a);
        const bt = sortKeyForPresence(b);
        if (at !== bt) return at - bt;
        return a.clientId.localeCompare(b.clientId);
      })
      .map((p) => {
        const d = p.data as PresenceMemberData | undefined;
        const sk = sortKeyForPresence(p);
        const aid =
          typeof d?.authUserId === 'string' && /^[0-9a-f-]{36}$/i.test(d.authUserId.trim())
            ? d.authUserId.trim()
            : undefined;
        const visible = d?.publicProfileVisible === true;
        return {
          clientId: p.clientId,
          displayName: (d?.displayName ?? 'ゲスト').trim() || 'ゲスト',
          participatesInSelection: d?.participatesInSelection !== false,
          timestamp: sk,
          textColor:
            typeof d?.textColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(d.textColor)
              ? d.textColor
              : undefined,
          status:
            typeof d?.status === 'string' && d.status.trim() ? d.status.trim() : undefined,
          yellowCards: yellowCardByClientId[p.clientId] ?? 0,
          isAway: false,
          ...(aid ? { authUserId: aid, publicProfileVisible: visible } : {}),
        };
      });

    const vacantRows = Object.entries(vacantByClientId)
      .filter(([id]) => !presenceData.some((p) => p.clientId === id))
      .filter(([, slot]) => now - slot.departedAtMs <= VACANT_SLOT_RETENTION_MS)
      .map(([clientId, slot]) => ({
        clientId,
        displayName: slot.displayName,
        participatesInSelection: slot.participatesInSelection,
        timestamp: slot.sortKey,
        textColor: slot.textColor,
        status: '退席中',
        yellowCards: yellowCardByClientId[clientId] ?? 0,
        isAway: true as const,
      }));

    return [...presentRows, ...vacantRows].sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      return a.clientId.localeCompare(b.clientId);
    });
  }, [presenceData, yellowCardByClientId, joinOrderEpoch, vacantByClientId]);
  /** 選曲に参加する人のみ・入室順（左から1,2,3...の番号に対応。一時退席枠を含む） */
  const participatingOrder = useMemo(
    () => participants.filter((p) => p.participatesInSelection),
    [participants]
  );
  currentTurnClientIdRef.current = currentTurnClientId;
  participatingOrderRef.current = participatingOrder;
  participantsForTurnRef.current = participants;
  resolveNextPresentTurnRef.current = (afterClientId: string) => {
    const order = participatingOrderRef.current;
    const present = presentClientIdsRef.current;
    const all = participantsForTurnRef.current;
    if (order.length === 0) return '';
    const iRing = order.findIndex((p) => p.clientId === afterClientId);
    if (iRing >= 0) {
      for (let step = 1; step <= order.length; step++) {
        const idx = (iRing + step) % order.length;
        const p = order[idx];
        if (p && present.has(p.clientId) && p.participatesInSelection !== false) {
          return p.clientId;
        }
      }
      return '';
    }
    /** 選曲輪にいない ID（視聴専用など）: 入室順でその後ろの最初の「在室・選曲参加」へ */
    const jAll = all.findIndex((p) => p.clientId === afterClientId);
    if (jAll < 0) {
      for (const p of order) {
        if (present.has(p.clientId) && p.participatesInSelection !== false) return p.clientId;
      }
      return '';
    }
    for (let step = 1; step <= all.length; step++) {
      const idx = (jAll + step) % all.length;
      const cand = all[idx];
      if (
        cand.participatesInSelection !== false &&
        present.has(cand.clientId) &&
        cand.isAway !== true
      ) {
        return cand.clientId;
      }
    }
    return '';
  };
  /** 参加者欄の [n] と同じ入室順（1始まり）。Ably ハンドラから参照 */
  const participantJoinRankByClientIdRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const m = new Map<string, number>();
    participants.forEach((p, i) => {
      m.set(p.clientId, i + 1);
    });
    participantJoinRankByClientIdRef.current = m;
  }, [participants]);

  const presentParticipants = useMemo(
    () => participants.filter((p) => !p.isAway),
    [participants]
  );

  const oldestParticipantClientId = useMemo(() => {
    if (presentParticipants.length === 0) return '';
    const sorted = [...presentParticipants].sort((a, b) => a.timestamp - b.timestamp);
    return sorted[0].clientId;
  }, [presentParticipants]);

  const ownerClientId = ownerState.ownerClientId;
  const ownerLeftAt = ownerState.ownerLeftAt;
  const isOwner = Boolean(myClientId && ownerClientId && myClientId === ownerClientId && ownerLeftAt === null);
  const canUseOwnerControls = isOwner && !isGuest;

  const publishRef = useRef<((name: string, data: unknown) => void) | null>(null);

  const ownerLeftAtRef = useRef(ownerLeftAt);
  const ownerClientIdRef = useRef(ownerClientId);
  const oldestRef = useRef(oldestParticipantClientId);
  ownerLeftAtRef.current = ownerLeftAt;
  ownerClientIdRef.current = ownerClientId;
  oldestRef.current = oldestParticipantClientId;

  const buildTurnStatePayload = useCallback((nextId: string, roundOverride?: number): TurnStatePayload => {
    return {
      currentTurnClientId: nextId,
      selectionRoundNumber: roundOverride ?? selectionRoundNumberRef.current,
    };
  }, []);

  /** ラウンド数の復元・オーナー交代でリセット（再入室は sessionStorage で最大6時間まで連続） */
  useEffect(() => {
    if (!roomId?.trim()) return;
    const rid = roomId.trim();
    if (lastRoundRoomIdRef.current !== rid) {
      lastRoundRoomIdRef.current = rid;
      prevOwnerForRoundRef.current = '';
    }
    const o = (ownerClientId ?? '').trim();
    if (!o) return;
    const prev = prevOwnerForRoundRef.current;
    const ownerChanged = prev !== '' && prev !== o;
    prevOwnerForRoundRef.current = o;
    if (ownerChanged) {
      selectionRoundNumberRef.current = 1;
      setSelectionRoundNumber(1);
      persistSelectionRound(rid, { round: 1, ownerClientId: o, updatedAt: Date.now() });
      return;
    }
    const persisted = readPersistedSelectionRound(rid, o);
    const next = persisted ?? 1;
    selectionRoundNumberRef.current = next;
    setSelectionRoundNumber(next);
  }, [roomId, ownerClientId]);

  useEffect(() => {
    if (!roomId) return;
    const t = setInterval(() => {
      const leftAt = ownerLeftAtRef.current;
      const oldest = oldestRef.current;
      const pub = publishRef.current;
      if (leftAt !== null && Date.now() - leftAt >= OWNER_ABSENCE_MS && oldest && pub) {
        const next = { ownerClientId: oldest, ownerLeftAt: null };
        setOwnerState(next);
        setOwnerStateToStorage(roomId, next);
        pub(OWNER_STATE_EVENT, next as OwnerStatePayload);
      }
    }, 10000);
    return () => clearInterval(t);
  }, [roomId]);

  const fetchFavoritedIds = useCallback(() => {
    if (isGuest) return;
    fetch('/api/favorites?idsOnly=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setFavoritedVideoIds(Array.isArray(data?.videoIds) ? data.videoIds : []))
      .catch(() => setFavoritedVideoIds([]));
  }, [isGuest]);

  useEffect(() => {
    fetchFavoritedIds();
  }, [fetchFavoritedIds]);

  const handleFavoriteClick = useCallback(
    async (row: { video_id: string; display_name: string; played_at: string; title: string | null; artist_name: string | null }, isFavorited: boolean) => {
      if (isGuest) return;
      if (isFavorited) {
        await fetch(`/api/favorites?videoId=${encodeURIComponent(row.video_id)}`, { method: 'DELETE' });
      } else {
        await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: row.video_id,
            displayName: row.display_name,
            playedAt: row.played_at,
            title: row.title ?? undefined,
            artistName: row.artist_name ?? undefined,
          }),
        });
      }
      fetchFavoritedIds();
    },
    [isGuest, fetchFavoritedIds]
  );

  const handleFavoriteCurrentClick = useCallback(
    async ({ videoId: vid, isFavorited }: { videoId: string; isFavorited: boolean }) => {
      if (isGuest) return;
      const videoIdTrim = (vid ?? '').trim();
      if (!videoIdTrim) return;
      if (isFavorited) {
        await fetch(`/api/favorites?videoId=${encodeURIComponent(videoIdTrim)}`, { method: 'DELETE' });
        fetchFavoritedIds();
        return;
      }
      const posterName =
        currentSongPosterClientId && participants.length > 0
          ? participants.find((p) => p.clientId === currentSongPosterClientId)?.displayName
          : undefined;
      await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: videoIdTrim,
          displayName: posterName ?? effectiveDisplayName,
          playedAt: new Date().toISOString(),
        }),
      });
      fetchFavoritedIds();
    },
    [isGuest, participants, currentSongPosterClientId, effectiveDisplayName, fetchFavoritedIds]
  );

  const openChatSummaryModal = useCallback(() => {
    const rid = (roomId ?? '').trim();
    setChatSummaryModalOpen(true);
    setChatSummaryLoading(true);
    setChatSummaryError(null);
    if (!rid) {
      setChatSummaryError('roomId が見つかりません。');
      setChatSummary(null);
      setChatSummaryLoading(false);
      return;
    }
    fetch(`/api/room-session-summary?roomId=${encodeURIComponent(rid)}`)
      .then((r) => (r.ok ? r.json() : r.json().catch(() => ({}))))
      .then((data) => {
        if (!data || data.error) {
          setChatSummaryError(data?.error ?? 'サマリー取得に失敗しました。');
          setChatSummary(null);
          return;
        }
        setChatSummary({
          summaryText: data.summaryText ?? '',
          sessionWindowLabel: data.sessionWindowLabel ?? '',
          participants: Array.isArray(data.participants) ? data.participants : [],
          participantSongCounts: Array.isArray(data.participantSongCounts) ? data.participantSongCounts : [],
          eraDistribution: Array.isArray(data.eraDistribution) ? data.eraDistribution : [],
          styleDistribution: Array.isArray(data.styleDistribution) ? data.styleDistribution : [],
          popularArtists: Array.isArray(data.popularArtists) ? data.popularArtists : [],
          popularTracks: Array.isArray(data.popularTracks) ? data.popularTracks : [],
        });
      })
      .catch(() => {
        setChatSummaryError('サマリー取得に失敗しました。');
        setChatSummary(null);
      })
      .finally(() => setChatSummaryLoading(false));
  }, [roomId]);

  const isShortConfirmation = (t: string) =>
    /^(はい|うん|ええ|お願い|そうです|お願いします|いいです|お願いね|はい!?|うん!?|ええ!?)$/i.test(t.trim());

  const touchActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now();
  }, []);

  const applyAiQuestionGuardEvent = useCallback(
    (payload: OwnerAiQuestionGuardPayload) => {
      if (!payload?.targetClientId) return;
      setYellowCardByClientId((prev) => ({
        ...prev,
        [payload.targetClientId]: Math.max(0, payload.yellowCards || 0),
      }));
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId(),
          body: payload.message,
          displayName: 'システム',
          messageType: 'system',
          createdAt: new Date().toISOString(),
          systemKind: 'ai_question_guard',
          aiGuardMeta: {
            targetClientId: payload.targetClientId,
            warningCount: payload.warningCount,
            yellowCards: payload.yellowCards,
            action: payload.action,
          },
        },
      ]);
      if (
        payload.action === 'ban' &&
        payload.targetClientId === myClientId &&
        roomId &&
        !isAiQuestionGuardKickExemptUserId(authUserId)
      ) {
        setKicked(roomId, myClientId);
        setKickedSitewide();
        onLeave?.();
      }
    },
    [myClientId, onLeave, roomId, authUserId],
  );

  const { publish } = useChannel(channelName, (message) => {
    if (message.name === OWNER_STATE_EVENT) {
      const d = message.data as OwnerStatePayload;
      if (d && typeof d.ownerClientId === 'string') {
        setOwnerState({
          ownerClientId: d.ownerClientId,
          ownerLeftAt: typeof d.ownerLeftAt === 'number' ? d.ownerLeftAt : null,
        });
        if (roomId) setOwnerStateToStorage(roomId, { ownerClientId: d.ownerClientId, ownerLeftAt: d.ownerLeftAt ?? null });
      }
      return;
    }
    if (message.name === OWNER_FORCE_EXIT_EVENT) {
      const d = message.data as OwnerForceExitPayload;
      if (!d?.targetClientId || !d?.targetDisplayName) return;
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId(),
          body: `オーナー権限により${d.targetDisplayName}さんが退出させられます`,
          displayName: 'システム',
          messageType: 'system',
          createdAt: new Date().toISOString(),
        },
      ]);
      if (d.targetClientId === myClientId && roomId) {
        setKicked(roomId, myClientId);
        onLeave?.();
      }
      return;
    }
    if (message.name === OWNER_SET_PARTICIPANT_SELECTION_EVENT) {
      const d = message.data as OwnerSetParticipantSelectionPayload;
      if (
        !d?.targetClientId ||
        typeof d.targetDisplayName !== 'string' ||
        typeof d.participatesInSelection !== 'boolean'
      ) {
        return;
      }
      const participating = d.participatesInSelection;
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId(),
          body: participating
            ? `オーナーにより${d.targetDisplayName}さんを選曲参加に切り替えました`
            : `オーナーにより${d.targetDisplayName}さんを視聴専用に切り替えました`,
          displayName: 'システム',
          messageType: 'system',
          createdAt: new Date().toISOString(),
        },
      ]);
      if (d.targetClientId === myClientId) {
        setParticipatesInSelection(participating);
      }
      return;
    }
    if (message.name === OWNER_AI_FREE_SPEECH_STOP_EVENT) {
      const d = message.data as OwnerAiFreeSpeechStopPayload;
      setAiFreeSpeechStopped(d?.enabled === true);
      return;
    }
    if (message.name === TURN_STATE_EVENT) {
      const d = message.data as TurnStatePayload;
      if (d && typeof d.currentTurnClientId === 'string') {
        setCurrentTurnClientId(d.currentTurnClientId);
      }
      if (
        d &&
        typeof d.selectionRoundNumber === 'number' &&
        Number.isFinite(d.selectionRoundNumber) &&
        d.selectionRoundNumber >= 1
      ) {
        const r = Math.floor(d.selectionRoundNumber);
        selectionRoundNumberRef.current = r;
        setSelectionRoundNumber(r);
        const rid = roomId?.trim();
        const oc = ownerClientIdRef.current.trim();
        if (rid && oc) {
          persistSelectionRound(rid, { round: r, ownerClientId: oc, updatedAt: Date.now() });
        }
      }
      return;
    }
    if (message.name === OWNER_5MIN_LIMIT_EVENT) {
      const d = message.data as Owner5MinLimitPayload;
      if (d && typeof d.enabled === 'boolean') {
        setSongLimit5MinEnabled(d.enabled);
      }
      return;
    }
    if (message.name === OWNER_COMMENT_PACK_MODE_EVENT) {
      const d = message.data as Record<string, unknown> | null;
      if (d && typeof d === 'object') {
        const sentAtRaw = d.sentAt;
        const sentAt =
          typeof sentAtRaw === 'number' && Number.isFinite(sentAtRaw) ? sentAtRaw : 0;
        // sentAt 付きの古いメッセージは無視（例: 先に「まとめてオフ」し、遅れて「4本すべて」のエコーが来る）
        if (sentAt > 0 && sentAt < commentPackSlotsSentAtRef.current) {
          return;
        }
        const slots = canonicalCommentPackSlots(normalizeCommentPackSlotsFromRequestBody(d));
        // 自分の publish のエコーなどで毎回新配列が届くと setState→useEffect→再 publish が回りチェックが点滅する。値が同じなら無視。
        if (commentPackSlotsEqual(slots, commentPackSlotsRef.current)) {
          if (sentAt > 0) {
            commentPackSlotsSentAtRef.current = Math.max(commentPackSlotsSentAtRef.current, sentAt);
          }
          return;
        }
        if (sentAt > 0) {
          commentPackSlotsSentAtRef.current = Math.max(commentPackSlotsSentAtRef.current, sentAt);
        }
        commentPackSlotsRef.current = slots;
        setCommentPackSlots(slots);
        const rid = roomId?.trim();
        if (rid) setCommentPackModeToStorage(rid, slots);
      }
      return;
    }
    if (message.name === OWNER_JP_AI_UNLOCK_EVENT) {
      const d = message.data as OwnerJpAiUnlockPayload;
      if (d && typeof d.enabled === 'boolean') {
        jpAiUnlockEnabledRef.current = d.enabled;
        setJpAiUnlockEnabled(d.enabled);
      }
      return;
    }
    if (message.name === OWNER_AI_QUESTION_GUARD_EVENT) {
      const d = message.data as OwnerAiQuestionGuardPayload;
      if (!d?.targetClientId || typeof d.message !== 'string') return;
      // 送信者は送信直後に既に apply 済み。Ably のエコーで同じ警告が二重に出ないようにする。
      if (d.targetClientId === myClientId) return;
      applyAiQuestionGuardEvent(d);
      return;
    }
    if (message.name === PLAYBACK_HISTORY_UPDATED_EVENT) {
      const d = message.data as PlaybackHistoryUpdatedPayload;
      const targetVid = typeof d?.videoId === 'string' ? d.videoId : null;
      // 現在再生中の曲に紐づく更新だけを即時反映（過去曲通知で不要再取得しない）
      if (targetVid && videoIdRef.current && targetVid !== videoIdRef.current) return;
      setPlaybackHistoryRefreshKey((k) => k + 1);
      return;
    }
    if (message.name === REQUEST_PLAYBACK_SYNC_EVENT) {
      const vid = videoIdRef.current;
      const pubId = lastChangeVideoPublisherRef.current;
      if (!vid || !pubId) return;
      const handle = playerRef.current;
      const ytState = handle?.getPlayerState?.() ?? null;
      const isPlayingLike =
        playingRef.current ||
        ytState === YT_PLAYER_STATE_PLAYING ||
        ytState === YT_PLAYER_STATE_BUFFERING;
      if (!isPlayingLike) return;
      let currentTime = 0;
      let duration = 0;
      try {
        currentTime = handle?.getCurrentTime?.() ?? 0;
      } catch {
        currentTime = 0;
      }
      try {
        duration = handle?.getDuration?.() ?? 0;
      } catch {
        duration = 0;
      }
      // 再生終端付近（実質 ended）では遅延入室へ「再生中」と誤通知しない
      if (duration > 0.5 && currentTime >= Math.max(0, duration - 0.8)) return;
      /** 複数クライアントが返しても、受信側は同一動画なら二重適用を捨てる */
      publishRef.current?.(PLAYBACK_SNAPSHOT_EVENT, {
        type: 'sync',
        videoId: vid,
        publisherClientId: pubId,
        currentTime,
        playing: true,
        currentTurnClientId: currentTurnClientIdRef.current,
        trackStartedAtMs: currentTrackStartedAtMsRef.current || Date.now(),
        selectionRoundNumber: selectionRoundNumberRef.current,
      } as PlaybackMessage);
      return;
    }
    if (message.name === CHAT_MESSAGE_EVENT) {
      lastActivityAtRef.current = Date.now();
      const data = message.data as ChatMessagePayload & { clientId?: string };
      if (!data?.id || !data?.body) return;
      if (data.messageType === 'ai' && data.jpDomesticSilenceForVideoId) {
        jpDomesticSilenceVideoIdRef.current = data.jpDomesticSilenceForVideoId;
      }
      if (data.messageType === 'user') {
        hasUserSentMessageRef.current = true;
        tidbitCountSinceUserMessageRef.current = 0;
        lastEndedVideoIdForTidbitRef.current = null;
        const senderId = data.clientId ?? '';
        if (senderId && senderId === currentTurnClientIdRef.current && isPassPhrase(data.body)) {
          const order = participatingOrderRef.current;
          const cur = currentTurnClientIdRef.current;
          const nextId = resolveNextPresentTurnRef.current(cur);
          const nextParticipant = order.find((p) => p.clientId === nextId);
          if (senderId === myClientId) {
            safePublish(TURN_STATE_EVENT, buildTurnStatePayload(nextId));
            const nextDisplayName = nextParticipant?.displayName ?? '次の方';
            addAiMessage(`${nextDisplayName}さん、次の曲を貼ってください`, {
              allowWhenAiStopped: true,
              bypassJpDomesticSilence: true,
            });
          }
        }
      }
      // 次の選曲案内が出たら、全クライアントで遅延中の自由コメントを破棄（案内の後に旧曲の解説が続かないように）
      if (data.messageType === 'ai') {
        const bodyAi = data.body ?? '';
        if (
          /次の曲を貼ってください/.test(bodyAi) ||
          /次の曲をどうぞ/.test(bodyAi) ||
          /^5分経過しましたので、/.test(bodyAi.trim())
        ) {
          if (freeCommentTimeoutsRef.current.length > 0) {
            freeCommentTimeoutsRef.current.forEach((t) => clearTimeout(t));
            freeCommentTimeoutsRef.current = [];
          }
          suppressTidbitRef.current = false;
        }
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        const p = data as ChatMessagePayload & { clientId?: string };
        return [
          ...prev,
          {
            id: data.id,
            body: data.body,
            displayName: data.displayName ?? 'ゲスト',
            messageType: data.messageType ?? 'user',
            createdAt: data.createdAt,
            clientId: p.clientId,
            ...(p.tidbitId ? { tidbitId: p.tidbitId } : {}),
            ...(p.songId != null ? { songId: p.songId } : {}),
            ...(p.videoId != null ? { videoId: p.videoId } : {}),
            ...(p.aiSource ? { aiSource: p.aiSource } : {}),
            ...(p.jpDomesticSilenceForVideoId
              ? { jpDomesticSilenceForVideoId: p.jpDomesticSilenceForVideoId }
              : {}),
            ...(p.playJoinChime ? { playJoinChime: true as const } : {}),
            ...(p.playLeaveChime ? { playLeaveChime: true as const } : {}),
          },
        ];
      });
      return;
    }
    const data = message.data as PlaybackMessage;
    if (!data?.type) return;

    if (message.name === PLAYBACK_SNAPSHOT_EVENT && data.type === 'sync') {
      if (!data.videoId || !data.publisherClientId) return;
      const snapMsgClientId =
        message && typeof message === 'object' && 'clientId' in message
          ? (message as { clientId?: string | null }).clientId
          : undefined;
      if (myClientId && typeof snapMsgClientId === 'string' && snapMsgClientId === myClientId) {
        return;
      }
      if (
        videoIdRef.current === data.videoId &&
        lastChangeVideoPublisherRef.current === data.publisherClientId
      ) {
        return;
      }

      const wasWithoutPlayback = !videoIdRef.current;
      const targetVid = data.videoId;

      if (playbackQueueFallbackTimerRef.current) {
        clearTimeout(playbackQueueFallbackTimerRef.current);
        playbackQueueFallbackTimerRef.current = null;
      }
      songReservationQueueRef.current = [];
      pendingQueuedVideoIdRef.current = null;
      pendingQueuedPublisherRef.current = '';
      setQueuedSongPublisherClientIds([]);
      jpDomesticSilenceVideoIdRef.current = null;

      setVideoId(targetVid);
      trackEndedGraceWindowUntilRef.current = 0;
      const pubId = data.publisherClientId;
      lastChangeVideoPublisherRef.current = pubId;
      setCurrentSongPosterClientId(pubId);
      if (typeof data.currentTurnClientId === 'string') {
        setCurrentTurnClientId(data.currentTurnClientId);
      }
      if (
        typeof data.selectionRoundNumber === 'number' &&
        Number.isFinite(data.selectionRoundNumber) &&
        data.selectionRoundNumber >= 1
      ) {
        const r = Math.floor(data.selectionRoundNumber);
        selectionRoundNumberRef.current = r;
        setSelectionRoundNumber(r);
        const rid = roomId?.trim();
        const oc = ownerClientIdRef.current.trim();
        if (rid && oc) {
          persistSelectionRound(rid, { round: r, ownerClientId: oc, updatedAt: Date.now() });
        }
      }
      if (typeof data.trackStartedAtMs === 'number' && data.trackStartedAtMs > 0) {
        currentTrackStartedAtMsRef.current = data.trackStartedAtMs;
      } else {
        currentTrackStartedAtMsRef.current = Date.now();
      }
      // commentPackMode は owner:commentPackMode のみで同期（再生メッセージで上書きすると他クライアントの古い ref で点滅する）

      playerRef.current?.loadVideoById(targetVid);

      const syncCt =
        typeof data.currentTime === 'number' && Number.isFinite(data.currentTime)
          ? data.currentTime
          : 0;
      const syncPlay = data.playing === true;
      const syncStartedAt = Date.now();
      const trySeekSynced = () => {
        const handle = playerRef.current;
        if (!handle || videoIdRef.current !== targetVid) return;
        const ytState = handle.getPlayerState?.() ?? null;
        if (ytState === null) {
          if (Date.now() - syncStartedAt < AUTO_PLAY_GIVE_UP_MS) {
            window.setTimeout(trySeekSynced, AUTO_PLAY_POLL_MS);
          }
          return;
        }
        applyingRemoteRef.current = true;
        try {
          let dur = 0;
          try {
            dur = handle.getDuration?.() ?? 0;
          } catch {
            dur = 0;
          }
          const safeTime =
            dur > 0.5
              ? Math.min(Math.max(0, syncCt), Math.max(0, dur - 0.25))
              : Math.max(0, syncCt);
          handle.seekTo(safeTime);
          if (syncPlay) {
            handle.playVideo();
            ensurePlayingWithRetry(safeTime, 'snapshot-sync');
            setPlaying(true);
          } else {
            handle.pauseVideo();
            setPlaying(false);
          }
          setCurrentTime(safeTime);
        } finally {
          setTimeout(() => {
            applyingRemoteRef.current = false;
          }, 300);
        }
      };
      window.setTimeout(trySeekSynced, 80);

      if (wasWithoutPlayback && syncPlay) {
        const order = participatingOrderRef.current;
        const posterName =
          order.find((p) => p.clientId === pubId)?.displayName?.trim() || '参加者';
        addAiMessage(`現在${posterName}さんの選曲が再生中です。`, {
          allowWhenAiStopped: true,
          bypassJpDomesticSilence: true,
        });
        fetch('/api/ai/announce-song', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: targetVid,
            displayName: posterName,
            roomId,
            jpAiUnlockEnabled: jpAiUnlockEnabledRef.current,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data?.text || typeof data.text !== 'string') return;
            const songLine = data.text.split('\n')[1]?.trim();
            if (!songLine) return;
            addAiMessage(songLine, {
              allowWhenAiStopped: true,
              bypassJpDomesticSilence: true,
              localOnly: true,
              videoId: targetVid,
            });
          })
          .catch(() => {});
      }

      return;
    }

    if (data.type === 'queueSong' && data.videoId) {
      const queuedMsgClientId =
        message && typeof message === 'object' && 'clientId' in message
          ? (message as { clientId?: string | null }).clientId
          : undefined;
      const queuedPublisherClientId =
        (typeof data.publisherClientId === 'string' && data.publisherClientId.trim()) ||
        (typeof queuedMsgClientId === 'string' ? queuedMsgClientId : '');
      if (!queuedPublisherClientId) return;
      const q = songReservationQueueRef.current;
      if (q.some((e) => e.publisherClientId === queuedPublisherClientId)) {
        return;
      }
      if (playbackQueueFallbackTimerRef.current) {
        clearTimeout(playbackQueueFallbackTimerRef.current);
        playbackQueueFallbackTimerRef.current = null;
      }
      q.push({ videoId: data.videoId, publisherClientId: queuedPublisherClientId });
      syncSongReservationQueueHead();
      const publisherDisplayName =
        participants.find((p) => p.clientId === queuedPublisherClientId)?.displayName?.trim() ||
        '参加者';
      const joinRank =
        participantJoinRankByClientIdRef.current.get(queuedPublisherClientId) ?? q.length;
      const roundN = Math.max(1, Math.floor(selectionRoundNumberRef.current));
      addSystemMessage(
        `${publisherDisplayName}さんの選曲を予約完了（ラウンド ${roundN}・入室順${joinRank}番目。現在の曲の終了後に再生予定）。`
      );
      /* ended 後にキューだけ遅れて入ったときの再試行。再生中に呼ぶと imPoster が即 tryApply してしまうため playbackEndedApply 内でガードする */
      queueMicrotask(() => {
        playbackEndedApplyRef.current();
      });
      return;
    }
    if (data.type === 'cancelQueueSong') {
      const cancelPub =
        (typeof data.publisherClientId === 'string' && data.publisherClientId.trim()) || '';
      if (!cancelPub) return;
      const cancelSenderId =
        message && typeof message === 'object' && 'clientId' in message
          ? (message as { clientId?: string | null }).clientId
          : undefined;
      if (typeof cancelSenderId !== 'string' || cancelSenderId !== cancelPub) return;
      const qCancel = songReservationQueueRef.current;
      const cancelIdx = qCancel.findIndex((e) => e.publisherClientId === cancelPub);
      if (cancelIdx < 0) return;
      qCancel.splice(cancelIdx, 1);
      if (playbackQueueFallbackTimerRef.current) {
        clearTimeout(playbackQueueFallbackTimerRef.current);
        playbackQueueFallbackTimerRef.current = null;
      }
      syncSongReservationQueueHead();
      const cancelDisplayName =
        participants.find((p) => p.clientId === cancelPub)?.displayName?.trim() || '参加者';
      addSystemMessage(`${cancelDisplayName}さんが選曲予約を取り消しました。`);
      if (myClientId && cancelSenderId === myClientId) {
        addSystemMessage(
          '再度予約する場合は、下の入力欄にYouTubeのURLを貼って送信してください。',
        );
      }
      return;
    }
    const msgClientId =
      message && typeof message === 'object' && 'clientId' in message
        ? (message as { clientId?: string | null }).clientId
        : undefined;
    if (data.type === 'skipToEnd' && data.videoId) {
      const poster = lastChangeVideoPublisherRef.current;
      const ownerId = ownerClientIdRef.current;
      const ownerActive = ownerLeftAtRef.current === null && Boolean(ownerId);
      const allowedSender =
        typeof msgClientId === 'string' &&
        ((poster && msgClientId === poster) || (ownerActive && msgClientId === ownerId));
      if (!allowedSender) {
        playbackLog('ably: ignore skipToEnd', { msgClientId, poster, ownerId, ownerActive });
        return;
      }
      const targetVid = data.videoId;
      if (targetVid !== videoIdRef.current) return;
      // 全員で UI を「再生中」扱いから外す（ended を待たない）
      setSkipUsedForVideoId(targetVid);
      setCurrentSongPosterClientId('');

      const posterName =
        participants.find((p) => p.clientId === poster)?.displayName?.trim() || '選曲者';
      addSystemMessage(`${posterName}さんの曲がスキップされました`);

      // キューが残っているなら、即座に待機中の曲へ切り替える
      const pv = pendingQueuedVideoIdRef.current;
      const pp = pendingQueuedPublisherRef.current;
      if (pv && pv !== targetVid) {
        // 次曲への確定遷移はスキップ操作を送信したクライアントだけが行う。
        // 全員が applyImmediateChangeVideo を実行すると、曲紹介生成が重複する。
        if (!myClientId || !msgClientId || myClientId !== msgClientId) {
          return;
        }
        const qSkip = songReservationQueueRef.current;
        if (
          qSkip.length > 0 &&
          qSkip[0].videoId === pv &&
          qSkip[0].publisherClientId === (pp || '')
        ) {
          qSkip.shift();
          syncSongReservationQueueHead();
        } else if (qSkip.length > 0) {
          songReservationQueueRef.current = [];
          syncSongReservationQueueHead();
        }
        if (playbackQueueFallbackTimerRef.current) {
          clearTimeout(playbackQueueFallbackTimerRef.current);
          playbackQueueFallbackTimerRef.current = null;
        }
        applyingRemoteRef.current = true;
        try {
          applyImmediateChangeVideo(pv, pp || myClientId, { preserveReservationQueue: true });
        } finally {
          setTimeout(() => {
            applyingRemoteRef.current = false;
          }, 300);
        }
        return;
      }

      // キューが無い場合は、同曲を再始動させず停止して次の選曲案内へ進む
      try {
        playerRef.current?.pauseVideo();
      } catch {
        // noop
      }
      setVideoId(null);
      setPlaying(false);
      setCurrentTime(0);
      promptNextTurn();
      return;
    }
    /**
     * Ably は発行者本人にも changeVideo を配信する。
     * ローカルですでに loadVideoById 済みなのでエコーで再度 load すると二重デコードで音が重なる。
     */
    if (
      myClientId &&
      typeof msgClientId === 'string' &&
      msgClientId === myClientId &&
      data.type === 'changeVideo'
    ) {
      playbackLog('ably: skip self echo changeVideo', { videoId: data.videoId });
      return;
    }
    /**
     * 自分の play のエコーは、既に再生・バッファ中なら二重 playVideo（音の重なり）になるので無視する。
     * 未再生のときだけエコーで seekTo + play をかけ、モバイル等で初回が効かない場合の再試行に使う。
     */
    if (
      data.type === 'play' &&
      typeof data.currentTime === 'number' &&
      myClientId &&
      typeof msgClientId === 'string' &&
      msgClientId === myClientId
    ) {
      const st = playerRef.current?.getPlayerState?.() ?? null;
      if (st === YT_PLAYER_STATE_PLAYING || st === YT_PLAYER_STATE_BUFFERING) {
        playbackLog('ably: skip self echo play (already playing/buffering)', { st, currentTime: data.currentTime });
        return;
      }
      playbackLog('ably: apply self echo play (retry path)', { st, currentTime: data.currentTime });
    }
    applyingRemoteRef.current = true;
    try {
      if (data.type === 'changeVideo' && data.videoId) {
        if (playbackQueueFallbackTimerRef.current) {
          clearTimeout(playbackQueueFallbackTimerRef.current);
          playbackQueueFallbackTimerRef.current = null;
        }
        const qCv = songReservationQueueRef.current;
        const pubIdForQueue = data.publisherClientId ?? '';
        if (qCv.length > 0) {
          const h = qCv[0];
          if (h.videoId === data.videoId && h.publisherClientId === pubIdForQueue) {
            qCv.shift();
          } else {
            qCv.length = 0;
          }
        }
        syncSongReservationQueueHead();
        jpDomesticSilenceVideoIdRef.current = null;
        setVideoId(data.videoId);
        trackEndedGraceWindowUntilRef.current = 0;
        /* commentPackMode は owner:commentPackMode のみで同期 */
        /* 5分待機判定用。useEffect([videoId]) では上書きしない（スナップショットの trackStartedAtMs を壊さない） */
        currentTrackStartedAtMsRef.current = Date.now();
        const pubId = pubIdForQueue;
        lastChangeVideoPublisherRef.current = pubId;
        setCurrentSongPosterClientId(pubId);
        const fromPayload =
          typeof data.nextTurnClientId === 'string' ? data.nextTurnClientId.trim() : '';
        const nextId =
          fromPayload !== ''
            ? fromPayload
            : participatingOrderRef.current.length === 0
              ? ''
              : resolveNextPresentTurnRef.current(pubId);
        setCurrentTurnClientId(nextId);
        playerRef.current?.loadVideoById(data.videoId);
      } else if (data.type === 'play' && typeof data.currentTime === 'number') {
        const myTime = playerRef.current?.getCurrentTime?.() ?? 0;
        if (
          myTime > PLAY_SYNC_REWIND_THRESHOLD_SEC &&
          data.currentTime < myTime - PLAY_SYNC_REWIND_THRESHOLD_SEC
        ) {
          // 広告などで遅れた人の再生で巻き戻さない
          return;
        }
        setCurrentTime(data.currentTime);
        setPlaying(true);
        ensurePlayingWithRetry(data.currentTime, 'remote-play-event');
      } else if (data.type === 'seek' && typeof data.time === 'number') {
        setCurrentTime(data.time);
        playerRef.current?.seekTo(data.time);
      }
    } finally {
      setTimeout(() => {
        applyingRemoteRef.current = false;
      }, 300);
    }
  });
  const safePublish = useCallback(
    (name: string, data: unknown) => {
      try {
        publish(name, data);
      } catch (err) {
        // Ably の接続が閉じているタイミングで publish すると例外が投げられてページが落ちるため防ぐ
        // eslint-disable-next-line no-console
        console.warn('[Ably] publish failed (ignored):', err);
      }
    },
    [publish]
  );

  publishRef.current = safePublish;

  useEffect(() => {
    if (!myClientId) return;
    if (videoId != null) return;
    const otherPresent = participants.some((p) => p.clientId !== myClientId);
    if (!otherPresent) return;
    const timer = window.setTimeout(() => {
      if (videoIdRef.current != null) return;
      const now = Date.now();
      if (now - lastPlaybackSyncRequestAtRef.current < 1800) return;
      lastPlaybackSyncRequestAtRef.current = now;
      publishRef.current?.(REQUEST_PLAYBACK_SYNC_EVENT, {});
    }, 650);
    return () => window.clearTimeout(timer);
  }, [myClientId, participants, videoId]);

  // 遅れて入室した参加者にも現在の曲紹介スロットを共有する
  useEffect(() => {
    if (!canUseOwnerControls) return;
    const sentAt = Date.now();
    publishRef.current?.(OWNER_COMMENT_PACK_MODE_EVENT, {
      slots: commentPackSlots,
      sentAt,
    } as OwnerCommentPackModePayload);
  }, [canUseOwnerControls, commentPackSlots, participants.length]);

  // イベントの取りこぼし対策（オーナーが定期的に再配信）
  useEffect(() => {
    if (!canUseOwnerControls) return;
    const t = window.setInterval(() => {
      const sentAt = Date.now();
      publishRef.current?.(OWNER_COMMENT_PACK_MODE_EVENT, {
        slots: commentPackSlotsRef.current,
        sentAt,
      } as OwnerCommentPackModePayload);
    }, 5000);
    return () => window.clearInterval(t);
  }, [canUseOwnerControls]);

  // 遅れて入室した参加者にも現在の邦楽解禁状態を共有する
  useEffect(() => {
    if (!canUseOwnerControls) return;
    publishRef.current?.(OWNER_JP_AI_UNLOCK_EVENT, {
      enabled: jpAiUnlockEnabled,
    } as OwnerJpAiUnlockPayload);
  }, [canUseOwnerControls, jpAiUnlockEnabled, participants.length]);

  // 取りこぼし対策（オーナーが定期的に再配信）
  useEffect(() => {
    if (!canUseOwnerControls) return;
    const t = window.setInterval(() => {
      publishRef.current?.(OWNER_JP_AI_UNLOCK_EVENT, {
        enabled: jpAiUnlockEnabledRef.current,
      } as OwnerJpAiUnlockPayload);
    }, 5000);
    return () => window.clearInterval(t);
  }, [canUseOwnerControls]);

  const handleSkipCurrentTrack = useCallback(() => {
    const vid = videoIdRef.current;
    const poster = lastChangeVideoPublisherRef.current;
    if (!vid || !myClientId) return;
    const isPoster = Boolean(poster && myClientId === poster);
    const isOwnerSkip = canUseOwnerControls;
    if (!isPoster && !isOwnerSkip) return;
    setSkipUsedForVideoId(vid);
    safePublish('skipToEnd', {
      type: 'skipToEnd',
      videoId: vid,
    } as PlaybackMessage);
  }, [myClientId, safePublish, canUseOwnerControls]);

  const handleRequestCancelSongReservation = useCallback(() => {
    if (!myClientId) return;
    if (!songReservationQueueRef.current.some((e) => e.publisherClientId === myClientId)) return;
    setCancelReservationModalOpen(true);
  }, [myClientId]);

  const handleConfirmCancelSongReservation = useCallback(() => {
    setCancelReservationModalOpen(false);
    if (!myClientId) return;
    if (!songReservationQueueRef.current.some((e) => e.publisherClientId === myClientId)) return;
    safePublish('cancelQueueSong', {
      type: 'cancelQueueSong',
      publisherClientId: myClientId,
    } as PlaybackMessage);
  }, [myClientId, safePublish]);

  useEffect(() => {
    if (!cancelReservationModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCancelReservationModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelReservationModalOpen]);

  /** 曲投入後に自動再生し、全員に play(currentTime: 0) を配信する（準備完了を短い間隔で待ち、操作コンテキストに近いタイミングで play） */
  const scheduleAutoPlayAfterChangeVideo = useCallback(() => {
    if (autoPlayAfterChangeVideoRef.current != null) {
      window.clearInterval(autoPlayAfterChangeVideoRef.current);
      autoPlayAfterChangeVideoRef.current = null;
    }
    const startedAt = Date.now();
    let intervalId: number | null = null;

    const stopPolling = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      autoPlayAfterChangeVideoRef.current = null;
    };

    const tryPlayOnce = (): boolean => {
      const handle = playerRef.current;
      if (!handle) {
        if (Date.now() - startedAt >= AUTO_PLAY_GIVE_UP_MS) {
          playbackLog('scheduleAutoPlay: give up (no player ref handle)');
          stopPolling();
          return true;
        }
        playbackLog('scheduleAutoPlay: wait (no player ref handle yet)');
        return false;
      }
      /**
       * YouTubePlayer の ref は常に playVideo を持つが、内部 YT.Player 未生成時は no-op。
       * 以前はここで即成功扱いになり publish だけしてポーリング停止→一生再生されなかった。
       */
      const ytState = handle.getPlayerState?.() ?? null;
      if (ytState === null) {
        if (Date.now() - startedAt >= AUTO_PLAY_GIVE_UP_MS) {
          playbackLog('scheduleAutoPlay: give up (YT.Player never became ready)');
          stopPolling();
          return true;
        }
        playbackLog('scheduleAutoPlay: wait (YT.Player not ready)', { elapsedMs: Date.now() - startedAt });
        return false;
      }
      applyingRemoteRef.current = true;
      try {
        playbackLog('scheduleAutoPlay: seekTo(0) + playVideo()', { ytState });
        handle.seekTo(0);
        handle.playVideo();
        setCurrentTime(0);
        setPlaying(true);
        lastScheduledPlayPublishAtRef.current = Date.now();
        safePublish('play', { type: 'play', currentTime: 0 } as PlaybackMessage);
      } finally {
        setTimeout(() => {
          applyingRemoteRef.current = false;
        }, 300);
      }
      stopPolling();
      return true;
    };

    if (!tryPlayOnce()) {
      playbackLog('scheduleAutoPlay: start polling', { pollMs: AUTO_PLAY_POLL_MS });
      intervalId = window.setInterval(() => {
        tryPlayOnce();
      }, AUTO_PLAY_POLL_MS);
      autoPlayAfterChangeVideoRef.current = intervalId;
    }
  }, [safePublish]);

  /**
   * play 指示後に実際の PLAYER_STATE が PLAYING/BUFFERING になるまで短時間リトライ。
   * ブラウザや端末差で最初の playVideo() が効かないケースを吸収する。
   */
  const ensurePlayingWithRetry = useCallback((targetTime: number, reason: string) => {
    if (ensurePlayRetryRef.current != null) {
      window.clearInterval(ensurePlayRetryRef.current);
      ensurePlayRetryRef.current = null;
    }
    const startedAt = Date.now();
    const runOnce = (): boolean => {
      const handle = playerRef.current;
      if (!handle) {
        return Date.now() - startedAt >= AUTO_PLAY_GIVE_UP_MS;
      }
      const st = handle.getPlayerState?.() ?? null;
      if (st === YT_PLAYER_STATE_PLAYING || st === YT_PLAYER_STATE_BUFFERING) {
        setPlaying(true);
        return true;
      }
      applyingRemoteRef.current = true;
      try {
        if (Number.isFinite(targetTime)) {
          handle.seekTo(Math.max(0, targetTime));
          setCurrentTime(Math.max(0, targetTime));
        }
        handle.playVideo();
        playbackLog('ensurePlayingWithRetry: retry playVideo()', { reason, st, targetTime });
      } finally {
        window.setTimeout(() => {
          applyingRemoteRef.current = false;
        }, 220);
      }
      return Date.now() - startedAt >= AUTO_PLAY_GIVE_UP_MS;
    };

    if (runOnce()) return;
    ensurePlayRetryRef.current = window.setInterval(() => {
      if (runOnce() && ensurePlayRetryRef.current != null) {
        window.clearInterval(ensurePlayRetryRef.current);
        ensurePlayRetryRef.current = null;
      }
    }, AUTO_PLAY_POLL_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (autoPlayAfterChangeVideoRef.current != null) {
        window.clearInterval(autoPlayAfterChangeVideoRef.current);
        autoPlayAfterChangeVideoRef.current = null;
      }
      if (ensurePlayRetryRef.current != null) {
        window.clearInterval(ensurePlayRetryRef.current);
        ensurePlayRetryRef.current = null;
      }
    };
  }, []);

  /** 曲を貼った後にターンを次の人に進める（`afterClientId` は選曲した人の clientId） */
  const advanceTurnAfterPost = useCallback(
    (afterClientId?: string, precomputedNextId?: string) => {
      const id = afterClientId ?? myClientId;
      const trimmed =
        typeof precomputedNextId === 'string' ? precomputedNextId.trim() : '';
      const nextId = trimmed !== '' ? trimmed : resolveNextPresentTurnRef.current(id);
      const ring = getSelectablePresentRing(
        participatingOrderRef.current as SelectionRoundParticipant[],
        presentClientIdsRef.current,
      );
      const nextRound = computeNextSelectionRound({
        previousRound: selectionRoundNumberRef.current,
        afterClientId: id,
        nextTurnClientId: nextId,
        ownerClientId: ownerClientIdRef.current,
        ring,
      });
      selectionRoundNumberRef.current = nextRound;
      setSelectionRoundNumber(nextRound);
      const rid = roomId?.trim();
      const oc = ownerClientIdRef.current.trim();
      if (rid && oc) {
        persistSelectionRound(rid, { round: nextRound, ownerClientId: oc, updatedAt: Date.now() });
      }
      setCurrentTurnClientId(nextId);
      publishRef.current?.(TURN_STATE_EVENT, buildTurnStatePayload(nextId, nextRound));
    },
    [myClientId, roomId, buildTurnStatePayload]
  );

  const nextPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptNextTurnRef = useRef<(() => void) | null>(null);
  const handlePlayerStateChange = useCallback(
    (state: 'play' | 'pause' | 'ended', time: number) => {
      if (applyingRemoteRef.current) return;
      setCurrentTime(time);
      if (state === 'ended') {
        const endedVideoId = videoIdRef.current;
        playingRef.current = false;
        trackEndedGraceWindowUntilRef.current = Date.now() + TRACK_ENDED_GRACE_MS;
        setPlaying(false);
        // 曲終了直後に UI の「再生中」枠・スキップ表示を解除し、次の方へ切り替える
        setSkipUsedForVideoId(endedVideoId);
        setCurrentSongPosterClientId('');
        playbackEndedApplyRef.current();
        // 実際の ended を基準に、30秒後の次曲案内を必ず予約（予測タイマーの取りこぼし対策）
        if (nextPromptTimeoutRef.current) {
          clearTimeout(nextPromptTimeoutRef.current);
          nextPromptTimeoutRef.current = null;
        }
        if (endedVideoId) {
          nextPromptTimeoutRef.current = setTimeout(() => {
            nextPromptTimeoutRef.current = null;
            if (videoIdRef.current !== endedVideoId) return;
            if (nextPromptShownForVideoIdRef.current === endedVideoId) return;
            nextPromptShownForVideoIdRef.current = endedVideoId;
            lastEndedVideoIdForTidbitRef.current = endedVideoId;
            promptNextTurnRef.current?.();
          }, SEC_AFTER_END_BEFORE_PROMPT * 1000);
        }
        return;
      }
      setPlaying(state === 'play');
      if (state === 'play') {
        const justPublishedFromSchedule =
          Date.now() - lastScheduledPlayPublishAtRef.current < 2500;
        if (!justPublishedFromSchedule) {
          safePublish('play', {
            type: 'play',
            currentTime: time,
          } as PlaybackMessage);
        }
      }
      // pause は同期しない（誰かが止めても他メンバーは止めない。広告の有無で終了時刻がずれるため）
    },
    [safePublish]
  );

  const addAiMessage = useCallback(
    (
      body: string,
      options?: {
        allowWhenAiStopped?: boolean;
        tidbitId?: string | null;
        songId?: string | null;
        videoId?: string | null;
        aiSource?: ChatMessage['aiSource'];
        /** 選曲アナウンス（邦楽フラグ付きペイロード用）のみ true */
        bypassJpDomesticSilence?: boolean;
        jpDomesticSilenceForVideoId?: string;
        /** このブラウザのみに表示（Ably に送らない。入室時の自分向け案内など） */
        localOnly?: boolean;
        /** 参加者入室通知行のみ true（入室効果音の唯一のトリガ） */
        playJoinChime?: boolean;
        /** 参加者退室通知行のみ true（退室効果音の唯一のトリガ） */
        playLeaveChime?: boolean;
      }
    ) => {
      if (aiFreeSpeechStopped && !options?.allowWhenAiStopped) return;
      const jpSilence = jpDomesticSilenceVideoIdRef.current;
      const curVid = videoIdRef.current;
      if (
        jpSilence != null &&
        curVid != null &&
        jpSilence === curVid &&
        !options?.bypassJpDomesticSilence
      ) {
        return;
      }
      const id = createMessageId();
      const payload: ChatMessagePayload = {
        id,
        body,
        displayName: AI_DISPLAY_NAME,
        messageType: 'ai',
        createdAt: new Date().toISOString(),
        ...(options?.tidbitId ? { tidbitId: options.tidbitId } : {}),
        ...(options?.songId != null ? { songId: options.songId } : {}),
        ...(options?.videoId != null ? { videoId: options.videoId } : {}),
        ...(options?.aiSource ? { aiSource: options.aiSource } : {}),
        ...(options?.jpDomesticSilenceForVideoId
          ? { jpDomesticSilenceForVideoId: options.jpDomesticSilenceForVideoId }
          : {}),
        ...(options?.playJoinChime ? { playJoinChime: true as const } : {}),
        ...(options?.playLeaveChime ? { playLeaveChime: true as const } : {}),
      };
      if (!options?.localOnly) {
        safePublish(CHAT_MESSAGE_EVENT, payload);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: payload.id,
          body: payload.body,
          displayName: payload.displayName,
          messageType: payload.messageType,
          createdAt: payload.createdAt,
          ...(payload.tidbitId ? { tidbitId: payload.tidbitId } : {}),
          ...(payload.songId != null ? { songId: payload.songId } : {}),
          ...(payload.videoId != null ? { videoId: payload.videoId } : {}),
          ...(payload.aiSource ? { aiSource: payload.aiSource } : {}),
          ...(payload.jpDomesticSilenceForVideoId
            ? { jpDomesticSilenceForVideoId: payload.jpDomesticSilenceForVideoId }
            : {}),
          ...(payload.playJoinChime ? { playJoinChime: true as const } : {}),
          ...(payload.playLeaveChime ? { playLeaveChime: true as const } : {}),
        },
      ]);
    },
    [safePublish, aiFreeSpeechStopped]
  );

  useEffect(() => {
    if (!roomId || ownerStatePublishRef.current) return;
    const pub = publishRef.current;
    if (!pub) return;
    const apply = (next: OwnerStatePayload) => {
      setOwnerState({ ownerClientId: next.ownerClientId, ownerLeftAt: next.ownerLeftAt });
      setOwnerStateToStorage(roomId, next);
    };
    if (presentParticipants.length === 0) return;
    if (!ownerClientId) {
      const next = { ownerClientId: oldestParticipantClientId, ownerLeftAt: null };
      apply(next);
      ownerStatePublishRef.current = true;
      pub(OWNER_STATE_EVENT, next as OwnerStatePayload);
      setTimeout(() => {
        ownerStatePublishRef.current = false;
      }, 500);
      return;
    }
    const ownerStillPresent = participants.some((p) => p.clientId === ownerClientId);
    if (!ownerStillPresent) {
      const nextOwnerId = oldestParticipantClientId;
      if (nextOwnerId) {
        const next = { ownerClientId: nextOwnerId, ownerLeftAt: null };
        apply(next);
        ownerStatePublishRef.current = true;
        pub(OWNER_STATE_EVENT, next as OwnerStatePayload);
        setTimeout(() => {
          ownerStatePublishRef.current = false;
        }, 500);
      }
      return;
    }
    if (ownerLeftAt !== null) {
      const next = { ownerClientId, ownerLeftAt: null };
      apply(next);
      ownerStatePublishRef.current = true;
      pub(OWNER_STATE_EVENT, next as OwnerStatePayload);
      setTimeout(() => {
        ownerStatePublishRef.current = false;
      }, 500);
    }
  }, [
    roomId,
    participants,
    presentParticipants,
    oldestParticipantClientId,
    ownerClientId,
    ownerLeftAt,
    myClientId,
  ]);

  const addSystemMessage = useCallback((body: string, searchQueryOrOpts?: SystemMessageOptions) => {
    const opts =
      typeof searchQueryOrOpts === 'string'
        ? { searchQuery: searchQueryOrOpts }
        : searchQueryOrOpts ?? {};
    const createdAt = new Date().toISOString();
    const msg: ChatMessage = {
      id: createMessageId(),
      body,
      displayName: 'システム',
      messageType: 'system',
      createdAt,
      ...(opts.searchQuery && { searchQuery: opts.searchQuery }),
      ...(opts.systemKind && { systemKind: opts.systemKind }),
      ...(opts.aiGuardMeta && { aiGuardMeta: opts.aiGuardMeta }),
    };
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.messageType === 'system' && last.body === body) {
        const dt = Date.now() - new Date(last.createdAt).getTime();
        if (Number.isFinite(dt) && dt >= 0 && dt < 5000) return prev;
      }
      return [...prev, msg];
    });
  }, []);

  const clearLocalAiQuestionGuardState = useCallback(() => {
    const rid = roomId || 'unknown-room';
    clearAiQuestionWarnStorage(rid);
    clearKickedStorageForRoom(rid);
    clearKickedSitewideStorage();
    if (myClientId) {
      setYellowCardByClientId((prev) => ({ ...prev, [myClientId]: 0 }));
    }
    addSystemMessage(
      'この端末に保存されていた「@」質問の警告カウントと退場・入室制限の記録を消しました。',
    );
  }, [roomId, myClientId, addSystemMessage]);

  const previousParticipantsRef = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    /**
     * 入室・退出は Ably presence の在籍差分のみで見る。
     * participants には「退席中」空席枠（vacant・isAway）がマージされるが、
     * presence から落ちた直後は vacant 反映が次レンダーまで遅れ、
     * participants 全体で比較すると一瞬 clientId が消えて「退出」→ 枠復帰で「入室」と誤爆する。
     * presenceData だけ使えば vacant と無関係で安全。
     */
    const presentMap = new Map(
      presenceData.map((p) => {
        const d = p.data as PresenceMemberData | undefined;
        const name = (d?.displayName ?? 'ゲスト').trim() || 'ゲスト';
        return [p.clientId, name] as const;
      })
    );
    /** 全員が同じ差分を検知して addAiMessage すると Ably で同文言が複数回飛ぶ。最古入室者だけが配信する */
    const imOldest =
      Boolean(myClientId) &&
      oldestParticipantClientId !== '' &&
      myClientId === oldestParticipantClientId;

    if (previousParticipantsRef.current === null) {
      previousParticipantsRef.current = presentMap;
      if (imOldest && presentMap.size === 1 && myClientId && presentMap.has(myClientId)) {
        const displayName = presentMap.get(myClientId) ?? 'ゲスト';
        addAiMessage(`${displayName}さん入室\n${displayName}さんチャットオーナー`, {
          allowWhenAiStopped: true,
          playJoinChime: true,
        });
      }
      return;
    }
    const prev = previousParticipantsRef.current;
    const currentIds = new Set(presentMap.keys());

    if (imOldest) {
      let ownerLeftDetected = false;
      prev.forEach((displayName, clientId) => {
        if (!currentIds.has(clientId)) {
          addAiMessage(`${displayName}さん退出`, {
            allowWhenAiStopped: true,
            playLeaveChime: true,
          });
          if (clientId === ownerClientIdRef.current) {
            ownerLeftDetected = true;
          }
        }
      });
      presentMap.forEach((displayName, clientId) => {
        if (!prev.has(clientId)) {
          const soloFirst = prev.size === 0 && presentMap.size === 1;
          const body = soloFirst
            ? `${displayName}さん入室\n${displayName}さんチャットオーナー`
            : `${displayName}さん入室`;
          addAiMessage(body, { allowWhenAiStopped: true, playJoinChime: true });
        }
      });
      if (ownerLeftDetected && myClientId === oldestParticipantClientId) {
        const newOwnerName = presentMap.get(oldestParticipantClientId)?.trim() || 'ゲスト';
        addAiMessage(`${newOwnerName}さんオーナー引き継ぎ`, {
          allowWhenAiStopped: true,
        });
      }
    }
    previousParticipantsRef.current = presentMap;
  }, [presenceData, addAiMessage, oldestParticipantClientId, myClientId]);

  useEffect(() => {
    if (!joinEntryChimeEnabled) {
      joinChimeScannedLenRef.current = messages.length;
      return;
    }
    const n = messages.length;
    const prevLen = joinChimeScannedLenRef.current;
    if (n < prevLen) {
      joinChimeScannedLenRef.current = n;
      return;
    }
    chimeDebug('scan batch', {
      prevLen,
      n,
      newCount: n - prevLen,
      ids: messages.slice(prevLen, n).map((x) => x.id),
    });
    for (let i = prevLen; i < n; i++) {
      const m = messages[i];
      if (m.messageType !== 'ai') continue;
      const firstLine = (m.body ?? '').split('\n')[0]?.trim() ?? '';
      const leaveByBody = /さん退出$/.test(firstLine);
      /** 入室は playJoinChime のみ（本文一致は誤検知しやすいため据え置き） */
      if (m.playJoinChime) {
        chimeDebug('branch JOIN', {
          index: i,
          id: m.id,
          playJoinChime: m.playJoinChime,
          playLeaveChime: m.playLeaveChime,
          firstLinePreview: firstLine.slice(0, 80),
        });
        playJoinChimeClip();
        continue;
      }
      /**
       * 退室: playLeaveChime に加え、先頭行が「◯◯さん退出」なら close を鳴らす。
       * Ably ペイロードでフラグが欠けた場合でも入室音と取り違えないようにする。
       */
      if (m.playLeaveChime || leaveByBody) {
        chimeDebug('branch LEAVE', {
          index: i,
          id: m.id,
          playJoinChime: m.playJoinChime,
          playLeaveChime: m.playLeaveChime,
          leaveByBody,
          firstLinePreview: firstLine.slice(0, 80),
        });
        playLeaveChimeClip();
      }
    }
    joinChimeScannedLenRef.current = n;
  }, [messages, joinEntryChimeEnabled]);

  useEffect(() => {
    if (initialGreetingDoneRef.current || messages.length > 0) return;
    initialGreetingDoneRef.current = true;
    let cancelled = false;

    void (async () => {
      const timeGreeting = getTimeBasedGreeting();
      let greeting: string;
      let isWelcomeBack = false;
      try {
        // 同一部屋の退室記録だけ参照（他部屋では「おかえりなさい」にしない）
        const key = roomId ? getLastExitStorageKey(roomId) : null;
        const raw = key && typeof window !== 'undefined' ? sessionStorage.getItem(key) : null;
        if (raw) {
          const data = JSON.parse(raw) as { timestamp?: number; displayName?: string };
          const sameUser = data.displayName === effectiveDisplayName && typeof data.timestamp === 'number';
          const awayMs = sameUser ? Date.now() - data.timestamp! : 0;
          const minAwayMs = 1 * 1000;
          const maxAwayMs = 6 * 60 * 60 * 1000;
          const withinWelcomeBackRange = awayMs >= minAwayMs && awayMs <= maxAwayMs;
          if (sameUser && withinWelcomeBackRange) {
            greeting = `${effectiveDisplayName}さん、おかえりなさい！`;
            isWelcomeBack = true;
            sessionStorage.removeItem(key!);
          } else {
            greeting = `${effectiveDisplayName}さん、${timeGreeting}`;
          }
        } else {
          greeting = `${effectiveDisplayName}さん、${timeGreeting}`;
        }
      } catch {
        greeting = `${effectiveDisplayName}さん、${timeGreeting}`;
      }

      if (!cancelled && !isWelcomeBack && !isGuest && roomId?.trim()) {
        try {
          const r = await fetch(
            `/api/user/join-greeting?roomId=${encodeURIComponent(roomId.trim())}`,
            { credentials: 'include' },
          );
          const d = (await r.json().catch(() => null)) as {
            variant?: string;
            daysSinceLastVisit?: number | null;
          } | null;
          const line = lineFromJoinGreetingApi(effectiveDisplayName, timeGreeting, d);
          if (line) greeting = line;
        } catch {
          /* 時間帯挨拶のまま */
        }
      }

      if (cancelled) return;
      const localGuide = { allowWhenAiStopped: true, localOnly: true } as const;
      addAiMessage(greeting, localGuide);
      if (!isWelcomeBack) addAiMessage(AI_FIRST_VOICE, localGuide);
      addAiMessage(TURN_ORDER_VOICE, localGuide);
      if (participatingOrder.length > 0) {
        const present = presentClientIdsRef.current;
        const first =
          participatingOrder.find(
            (p) => present.has(p.clientId) && p.participatesInSelection !== false,
          ) ?? participatingOrder[0];
        setCurrentTurnClientId(first.clientId);
        publishRef.current?.(TURN_STATE_EVENT, buildTurnStatePayload(first.clientId));
        addAiMessage(`${first.displayName}さん、曲を貼ってください`, localGuide);
      } else {
        addAiMessage('どなたでもどうぞ貼ってください', localGuide);
      }
      touchActivity();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    messages.length,
    effectiveDisplayName,
    roomId,
    participatingOrder,
    addAiMessage,
    touchActivity,
    buildTurnStatePayload,
    isGuest,
  ]);

  useEffect(() => {
    const t = setInterval(() => {
      // comment-pack 由来の自由コメントを小出しにしている間は、一般豆知識は出さない
      if (suppressTidbitRef.current) return;
      if (!hasUserSentMessageRef.current && !videoIdRef.current) return;
      const jpS = jpDomesticSilenceVideoIdRef.current;
      const vNow = videoIdRef.current;
      if (jpS != null && vNow != null && jpS === vNow) return;
      const now = Date.now();
      if (
        now - lastActivityAtRef.current >= SILENCE_TIDBIT_SEC * 1000 &&
        now - lastTidbitAtRef.current >= TIDBIT_COOLDOWN_SEC * 1000
      ) {
        /* ステータスが設定されていて、かつ自分が発言していない場合は豆知識を出さない（外し忘れ時は発言があれば在席とみなす） */
        if (userStatus.trim() && !hasCurrentUserSentMessageSinceLastTidbitRef.current) return;
        const packedVid = commentPackVideoIdRef.current;
        const afterCommentPack =
          Boolean(packedVid) && packedVid === videoIdRef.current;
        const preferGeneral =
          afterCommentPack || tidbitCountSinceUserMessageRef.current >= 3;
        // 無言時の「洋楽全般」豆知識はオフ（API・トークン削減。曲に紐づく豆知識のみ）
        if (preferGeneral) return;
        lastTidbitAtRef.current = now;
        touchActivity();
        hasCurrentUserSentMessageSinceLastTidbitRef.current = false;
        const recentIds = recentlyUsedTidbitIdsRef.current.slice(-20);
        const preferMainArtist =
          !afterCommentPack && tidbitPreferMainArtistLeftRef.current > 0;
        const contextVideoId = lastEndedVideoIdForTidbitRef.current;
        const tidbitVideoId = contextVideoId ?? videoIdRef.current ?? undefined;
        fetch('/api/ai/tidbit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: tidbitVideoId,
            currentVideoIdForStyle: videoIdRef.current ?? undefined,
            recentlyUsedTidbitIds: recentIds,
            roomId: roomId ?? undefined,
            preferGeneralTidbit: false,
            preferMainArtistTidbit: preferMainArtist,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.text) {
              const prefix = data.source === 'library' ? '[DB] ' : '[NEW] ';
              const songRowId =
                typeof data.songTidbitId === 'string' ? data.songTidbitId : undefined;
              addAiMessage(prefix + data.text, {
                allowWhenAiStopped: true,
                ...(songRowId ? { tidbitId: songRowId } : {}),
                videoId: tidbitVideoId ?? undefined,
                aiSource: 'tidbit',
              });
              tidbitCountSinceUserMessageRef.current += 1;
              if (preferMainArtist) tidbitPreferMainArtistLeftRef.current = Math.max(0, tidbitPreferMainArtistLeftRef.current - 1);
            }
            if (data?.tidbitId && typeof data.tidbitId === 'string') {
              recentlyUsedTidbitIdsRef.current = [...recentlyUsedTidbitIdsRef.current, data.tidbitId].slice(-20);
            }
          })
          .catch(() => {});
      }
    }, 10000);
    return () => clearInterval(t);
  }, [touchActivity, addAiMessage, userStatus, roomId]);

  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(CHAT_TEXT_COLOR_STORAGE_KEY) : null;
      if (saved && /^#[0-9a-fA-F]{6}$/.test(saved)) setUserTextColor(saved);
    } catch {}
  }, []);

  /** 複数人・5分制限ON・再生中で、開始から5分未満なら次曲はキューのみ（オーナー含む全員。即時切替しない） */
  const shouldDeferMultiSongPost = useCallback(() => {
    if (!songLimit5MinEnabledRef.current) return false;
    const order = participatingOrderRef.current;
    if (order.length <= 1) return false;
    const normalizedNames = order.map((p) => (p.displayName ?? '').trim() || 'ゲスト');
    if (order.length > 1 && new Set(normalizedNames).size === 1) return false;
    if (!videoIdRef.current) return false;
    if (Date.now() < trackEndedGraceWindowUntilRef.current) return false;
    const started = currentTrackStartedAtMsRef.current;
    if (!started) return false;
    return Date.now() - started < FIVE_MIN_MS;
  }, []);

  const clearPendingFreeCommentTimers = useCallback(() => {
    if (freeCommentTimeoutsRef.current.length > 0) {
      freeCommentTimeoutsRef.current.forEach((t) => clearTimeout(t));
      freeCommentTimeoutsRef.current = [];
    }
    suppressTidbitRef.current = false;
  }, []);

  /** 視聴専用をスキップしつつ、次の選曲者に促す。曲終了・5分経過時は投稿者のクライアントのみ実行 */
  const promptNextTurn = useCallback((options?: { fiveMinElapsed?: boolean }) => {
    if (myClientId !== lastChangeVideoPublisherRef.current) return;
    const fiveMinElapsed = options?.fiveMinElapsed === true;
    let cur = currentTurnClientIdRef.current;
    const order = participatingOrderRef.current;
    const orderLength = order.length;
    const participantsMap = new Map(participants.map((p) => [p.clientId, p]));
    const present = presentClientIdsRef.current;
    while (cur) {
      const p = participantsMap.get(cur);
      if (p?.participatesInSelection === false) {
        cur = resolveNextPresentTurnRef.current(cur);
        setCurrentTurnClientId(cur);
        publishRef.current?.(TURN_STATE_EVENT, buildTurnStatePayload(cur));
        continue;
      }
      if (!present.has(cur) || p?.isAway) {
        cur = resolveNextPresentTurnRef.current(cur);
        setCurrentTurnClientId(cur);
        publishRef.current?.(TURN_STATE_EVENT, buildTurnStatePayload(cur));
        continue;
      }
      break;
    }
    // 選曲予約済みなら「次を貼って」案内は出さない（5分経過・曲終了どちらも）
    if (cur) {
      const qReserve = songReservationQueueRef.current;
      if (qReserve.some((e) => e.publisherClientId === cur)) {
        return;
      }
    }
    // 参加者が1人だけのときは、5分経過メッセージは出さない
    if (fiveMinElapsed && orderLength <= 1) {
      return;
    }

    clearPendingFreeCommentTimers();

    // 参加者が1人だけのとき（通常の曲終了時）は、シンプルに全員宛てのメッセージにする
    if (orderLength <= 1) {
      addAiMessage('次の曲をどうぞ', { allowWhenAiStopped: true });
      return;
    }

    const prefix = fiveMinElapsed ? '5分経過しましたので、' : '';
    if (cur) {
      const displayName = order.find((o) => o.clientId === cur)?.displayName ?? '次の方';
      addAiMessage(`${prefix}${displayName}さん、次の曲を貼ってください`, { allowWhenAiStopped: true });
    } else {
      addAiMessage(`${prefix}次の曲を貼ってください`, { allowWhenAiStopped: true });
    }
  }, [participants, addAiMessage, myClientId, clearPendingFreeCommentTimers, buildTurnStatePayload]);

  useEffect(() => {
    promptNextTurnRef.current = () => promptNextTurn();
  }, [promptNextTurn]);

  /** ターンが一時退席枠を指しているとき、在室者へ寄せる（各クライアントで同一計算） */
  useEffect(() => {
    const cur = (currentTurnClientId ?? '').trim();
    if (!cur) return;
    const present = presentClientIdsRef.current;
    const pMeta = participants.find((p) => p.clientId === cur);
    if (
      pMeta &&
      present.has(cur) &&
      pMeta.participatesInSelection !== false &&
      !pMeta.isAway
    ) {
      return;
    }
    const next = resolveNextPresentTurnRef.current(cur);
    if (next && next !== cur) {
      setCurrentTurnClientId(next);
      publishRef.current?.(TURN_STATE_EVENT, buildTurnStatePayload(next));
      return;
    }
    if (!next) {
      setCurrentTurnClientId('');
      publishRef.current?.(TURN_STATE_EVENT, buildTurnStatePayload(''));
    }
  }, [currentTurnClientId, participants, vacantByClientId, presenceData, buildTurnStatePayload]);

  useEffect(() => {
    /* 曲開始時刻は applyImmediateChangeVideo / リモート changeVideo / 再生スナップショットで設定する */
    if (!videoId) {
      currentTrackStartedAtMsRef.current = 0;
    }
    nextPromptShownForVideoIdRef.current = null;
    lastEndedVideoIdForTidbitRef.current = null;
    if (!videoId) {
      jpDomesticSilenceVideoIdRef.current = null;
      setCurrentSongPosterClientId('');
    }
    if (nextPromptTimeoutRef.current) {
      clearTimeout(nextPromptTimeoutRef.current);
      nextPromptTimeoutRef.current = null;
    }
    if (fiveMinLimitTimeoutRef.current) {
      clearTimeout(fiveMinLimitTimeoutRef.current);
      fiveMinLimitTimeoutRef.current = null;
    }
    // 曲が変わったら、未消化の自由コメント用タイマーもクリア
    if (freeCommentTimeoutsRef.current.length > 0) {
      freeCommentTimeoutsRef.current.forEach((t) => clearTimeout(t));
      freeCommentTimeoutsRef.current = [];
    }
    suppressTidbitRef.current = false;
    commentPackVideoIdRef.current = null;
    setSkipUsedForVideoId(null);
  }, [videoId]);

  const fetchAnnounceAndPublish = useCallback(
    (
      vid: string,
      options?: {
        silent?: boolean;
        displayNameOverride?: string;
        adminPlaybackDisplayHint?: { title: string; artist_name: string | null };
      },
    ) => {
      const silent = options?.silent === true;
      const announceDisplayName =
        typeof options?.displayNameOverride === 'string' &&
        options.displayNameOverride.trim()
          ? options.displayNameOverride.trim()
          : effectiveDisplayName;
      const hint = options?.adminPlaybackDisplayHint;
      fetch('/api/ai/announce-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: vid,
          displayName: announceDisplayName,
          roomId,
          jpAiUnlockEnabled: jpAiUnlockEnabledRef.current,
          ...(hint?.title?.trim()
            ? {
                adminPlaybackDisplayHint: {
                  title: hint.title.trim(),
                  artist_name: hint.artist_name,
                },
              }
            : {}),
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          // 音楽以外のコンテンツと判定された場合は、注意メッセージのみ出して曲としては扱わない
          if (data?.nonMusic) {
            addSystemMessage(
              'この部屋では洋楽の曲・MV・ライブ映像など音楽コンテンツのみ投稿をお願いしています。アニメ本編やゲーム実況、切り抜き配信などは控えていただけると助かります。',
            );
            touchActivity();
            return;
          }
          if (!silent && data?.text) {
            const jpDomestic = data?.japaneseDomestic === true;
            const jpSilence =
              typeof data?.jpDomesticSilence === 'boolean' ? data.jpDomesticSilence : jpDomestic;
            if (jpSilence) {
              jpDomesticSilenceVideoIdRef.current = vid;
            }
            addAiMessage(data.text, {
              allowWhenAiStopped: true,
              bypassJpDomesticSilence: true,
              videoId: vid,
              ...(jpSilence ? { jpDomesticSilenceForVideoId: vid } : {}),
            });
            touchActivity();
          }
          const durationSec =
            typeof data?.durationSeconds === 'number' && data.durationSeconds > 0
              ? data.durationSeconds
              : DEFAULT_DURATION_WHEN_UNKNOWN_SEC;
          const delayMs = (durationSec + SEC_AFTER_END_BEFORE_PROMPT) * 1000;
          if (nextPromptTimeoutRef.current) clearTimeout(nextPromptTimeoutRef.current);
          nextPromptTimeoutRef.current = setTimeout(() => {
            nextPromptTimeoutRef.current = null;
            if (videoIdRef.current !== vid) return;
            if (nextPromptShownForVideoIdRef.current === vid) return;
            nextPromptShownForVideoIdRef.current = vid;
            lastEndedVideoIdForTidbitRef.current = vid;
            promptNextTurn();
          }, delayMs);
          if (songLimit5MinEnabledRef.current && fiveMinLimitTimeoutRef.current) clearTimeout(fiveMinLimitTimeoutRef.current);
          if (songLimit5MinEnabledRef.current) {
            fiveMinLimitTimeoutRef.current = setTimeout(() => {
              fiveMinLimitTimeoutRef.current = null;
              if (videoIdRef.current !== vid) return;
              /* 曲終了で既に促し済みの場合は「5分経過」は出さない（今流れている曲が5分以上のときだけ使う） */
              if (nextPromptShownForVideoIdRef.current === vid) return;
              const orderLen = participatingOrderRef.current.length;
              // 1人の部屋では promptNextTurn が無言 return する。先に案内済みフラグを立てると
              // 動画終了時の「次の曲をどうぞ」まで潰れるため、複数人のときだけフラグを立てる。
              if (orderLen > 1) {
                nextPromptShownForVideoIdRef.current = vid;
              }
              promptNextTurn({ fiveMinElapsed: true });
            }, FIVE_MIN_MS);
          }
        })
        .catch(() => {});
    },
    [addAiMessage, addSystemMessage, touchActivity, effectiveDisplayName, promptNextTurn, roomId]
  );

  const fetchCommentaryAndPublish = useCallback(
    (
      vid: string,
      options?: {
        skipCommentPackCache?: boolean;
        adminPlaybackDisplayHint?: { title: string; artist_name: string | null };
      },
    ) => {
      const slots = commentPackSlotsRef.current;
      if (isCommentPackFullyOff(slots)) {
        if (freeCommentTimeoutsRef.current.length > 0) {
          freeCommentTimeoutsRef.current.forEach((t) => clearTimeout(t));
          freeCommentTimeoutsRef.current = [];
        }
        // スロット全オフでは同一曲中の補助解説(tidbit)も出さない
        suppressTidbitRef.current = true;
        commentPackVideoIdRef.current = null;
        return;
      }
      const skipPackCache = options?.skipCommentPackCache === true;
      const packHint = options?.adminPlaybackDisplayHint;
      // まず comment-pack を試し、基本コメント＋自由コメント3本をまとめて取得して小出しにする
      fetch('/api/ai/comment-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: vid,
          slots,
          roomId,
          jpAiUnlockEnabled: jpAiUnlockEnabledRef.current,
          recentMessages: messages.slice(-18).map((m) => ({
            displayName: m.displayName,
            body: typeof m.body === 'string' ? m.body : '',
            messageType: m.messageType ?? 'user',
          })),
          ...(skipPackCache ? { skipCommentPackCache: true } : {}),
          ...(packHint?.title?.trim()
            ? {
                adminPlaybackDisplayHint: {
                  title: packHint.title.trim(),
                  artist_name: packHint.artist_name,
                },
              }
            : {}),
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((pack) => {
          if (pack?.skipAiCommentary) {
            if (freeCommentTimeoutsRef.current.length > 0) {
              freeCommentTimeoutsRef.current.forEach((t) => clearTimeout(t));
              freeCommentTimeoutsRef.current = [];
            }
            suppressTidbitRef.current = false;
            const isJpSilenceVideo =
              jpDomesticSilenceVideoIdRef.current != null &&
              jpDomesticSilenceVideoIdRef.current === vid;
            const skipReason =
              typeof pack?.skipReason === 'string' ? pack.skipReason : undefined;
            if (
              shouldShowJpNoCommentarySystemMessage(skipReason, isJpSilenceVideo)
            ) {
              addSystemMessage(SYSTEM_MESSAGE_JP_NO_COMMENTARY);
            }
            return null;
          }
          const baseStr = typeof pack?.baseComment === 'string' ? pack.baseComment.trim() : '';
          const freeArr: string[] = Array.isArray(pack.freeComments)
            ? pack.freeComments.map((c: unknown) => (typeof c === 'string' ? c : ''))
            : [];
          while (freeArr.length < COMMENT_PACK_MAX_FREE_COMMENTS) freeArr.push('');
          const hasBase = baseStr.length > 0;
          const hasAnyFree = freeArr.slice(0, COMMENT_PACK_MAX_FREE_COMMENTS).some((c) => c.trim());

          if (hasBase || hasAnyFree) {
            commentPackVideoIdRef.current = vid;
            const packPrefix = pack?.source === 'library' ? '[DB] ' : '[NEW] ';
            const ids: (string | null | undefined)[] = Array.isArray(pack.tidbitIds) ? pack.tidbitIds : [];
            const freeTidbitIdsRaw: unknown[] = Array.isArray(pack.freeCommentTidbitIds)
              ? pack.freeCommentTidbitIds
              : [];
            const tid0 = parseTidbitIdFromPack(ids[0]);
            if (hasBase) {
              const modIntro = formatMusic8ModeratorIntroPrefix(
                canRejectTidbit,
                pack.music8ModeratorHints,
              );
              addAiMessage(packPrefix + modIntro + baseStr, {
                allowWhenAiStopped: true,
                tidbitId: tid0,
                songId: pack.songId ?? null,
                videoId: vid,
                aiSource: 'tidbit',
              });
              touchActivity();
            }
            tidbitPreferMainArtistLeftRef.current = 2;

            if (freeCommentTimeoutsRef.current.length > 0) {
              freeCommentTimeoutsRef.current.forEach((t) => clearTimeout(t));
              freeCommentTimeoutsRef.current = [];
            }

            const pendingFreeBodies = freeArr
              .slice(0, COMMENT_PACK_MAX_FREE_COMMENTS)
              .map((c) => c.trim())
              .filter(Boolean);
            suppressTidbitRef.current =
              equivalentBaseOnlySlots(commentPackSlotsRef.current) || pendingFreeBodies.length > 0;

            let shownIdx = 0;
            for (let i = 0; i < COMMENT_PACK_MAX_FREE_COMMENTS; i++) {
              const c = freeArr[i]?.trim() ?? '';
              if (!c) continue;
              const delayMs = (shownIdx + 1) * 60 * 1000;
              shownIdx += 1;
              const tidN =
                parseTidbitIdFromPack(freeTidbitIdsRaw[i]) ??
                parseTidbitIdFromPack(ids[i + 1]);
              const timer = setTimeout(() => {
                if (videoIdRef.current !== vid) return;
                if (nextPromptShownForVideoIdRef.current === vid) return;
                addAiMessage(packPrefix + c, {
                  allowWhenAiStopped: true,
                  tidbitId: tidN,
                  songId: pack.songId ?? null,
                  videoId: vid,
                  aiSource: 'tidbit',
                });
                touchActivity();
              }, delayMs);
              freeCommentTimeoutsRef.current.push(timer);
            }
          } else {
            if (isDevMinimalSongAi()) {
              addSystemMessage(SYSTEM_MESSAGE_COMMENTARY_FETCH_FAILED);
              return null;
            }
            // パック取得に失敗した場合は従来の commentary API にフォールバック
            return fetch('/api/ai/commentary', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoId: vid,
                roomId,
                jpAiUnlockEnabled: jpAiUnlockEnabledRef.current,
              }),
            })
              .then((r) => (r.ok ? r.json() : null))
              .then((data) => {
                if (data?.skipAiCommentary) {
                  const isJpSilenceVideo =
                    jpDomesticSilenceVideoIdRef.current != null &&
                    jpDomesticSilenceVideoIdRef.current === vid;
                  const skipReason =
                    typeof data?.skipReason === 'string' ? data.skipReason : undefined;
                  if (
                    shouldShowJpNoCommentarySystemMessage(skipReason, isJpSilenceVideo)
                  ) {
                    addSystemMessage(SYSTEM_MESSAGE_JP_NO_COMMENTARY);
                  }
                  return null;
                }
                if (data?.text) {
                  const prefix = data.source === 'library' ? '[DB] ' : '[NEW] ';
                  const songRowId =
                    typeof data.songTidbitId === 'string' ? data.songTidbitId : undefined;
                  addAiMessage(prefix + data.text, {
                    allowWhenAiStopped: true,
                    ...(songRowId ? { tidbitId: songRowId } : {}),
                    songId: typeof data.songId === 'string' ? data.songId : null,
                    videoId: vid,
                    aiSource: 'tidbit',
                  });
                  touchActivity();
                  tidbitPreferMainArtistLeftRef.current = 2;
                } else {
                  addSystemMessage(SYSTEM_MESSAGE_COMMENTARY_FETCH_FAILED);
                }
              });
          }
          return null;
        })
        .catch(() => {
          addSystemMessage(SYSTEM_MESSAGE_COMMENTARY_FETCH_FAILED);
        });
    },
    [addAiMessage, addSystemMessage, touchActivity, roomId, messages, canRejectTidbit]
  );

  const regenerateAiSongIntroAfterPlaybackTitleSave = useCallback(
    (detail: { videoId: string; title: string; artist_name: string | null | undefined }) => {
      const vid = detail.videoId.trim();
      if (!vid || videoIdRef.current !== vid) return;

      freeCommentTimeoutsRef.current.forEach((t) => clearTimeout(t));
      freeCommentTimeoutsRef.current = [];

      setMessages((prev) =>
        prev.filter((m) => {
          if (m.messageType !== 'ai' || m.videoId !== vid) return true;
          if (m.aiSource === 'tidbit') return false;
          if (/さんの選曲です[！!]/.test(m.body ?? '')) return false;
          return true;
        }),
      );

      const pubId = lastChangeVideoPublisherRef.current;
      const publisherDisplayName =
        participants.find((p) => p.clientId === pubId)?.displayName?.trim() ||
        (pubId === myClientId ? effectiveDisplayName : 'ゲスト');

      const hint = {
        title: detail.title.trim(),
        artist_name:
          typeof detail.artist_name === 'string' && detail.artist_name.trim()
            ? detail.artist_name.trim()
            : null,
      };

      fetchAnnounceAndPublish(vid, {
        silent: isDevMinimalSongAi(),
        displayNameOverride: publisherDisplayName,
        adminPlaybackDisplayHint: hint,
      });
      fetchCommentaryAndPublish(vid, {
        skipCommentPackCache: true,
        adminPlaybackDisplayHint: hint,
      });
    },
    [
      participants,
      myClientId,
      effectiveDisplayName,
      fetchAnnounceAndPublish,
      fetchCommentaryAndPublish,
    ]
  );

  const handleTidbitLibraryReject = useCallback(async (messageId: string, tidbitId: string) => {
    try {
      const res = await fetch('/api/ai/reject-tidbit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tidbitId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(typeof data?.error === 'string' ? data.error : 'ライブラリからの削除に失敗しました');
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, tidbitId: undefined, tidbitLibraryRejected: true } : m
        )
      );
    } catch {
      alert('ライブラリからの削除に失敗しました');
    }
  }, []);

  /** 視聴履歴の displayName / isGuest は「その曲を貼った人」。キュー適用を最古クライアントが行うときも食い違わないよう引数で渡す */
  const schedulePlaybackHistory = useCallback(
    (
      rid: string,
      vid: string,
      posterDisplayName: string,
      posterIsGuest: boolean,
      selectionRound: number,
    ) => {
      if (playbackHistoryTimeoutRef.current) clearTimeout(playbackHistoryTimeoutRef.current);
      if (!rid) return;
      const roundSnap = Math.max(1, Math.floor(selectionRound));
      playbackHistoryTimeoutRef.current = setTimeout(() => {
        playbackHistoryTimeoutRef.current = null;
        if (videoIdRef.current !== vid) return;
        fetch('/api/room-playback-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: rid,
            videoId: vid,
            displayName: posterDisplayName,
            isGuest: posterIsGuest,
            selectionRound: roundSnap,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (!data?.ok || data?.skipped) return;
            // 自分のUI更新
            setPlaybackHistoryRefreshKey((k) => k + 1);
            // 同室メンバーへ再取得通知
            safePublish(PLAYBACK_HISTORY_UPDATED_EVENT, {
              videoId: vid,
              at: Date.now(),
            } as PlaybackHistoryUpdatedPayload);
          })
          .catch(() => {});
      }, 10000);
    },
    [safePublish]
  );

  /**
   * 視聴履歴の INSERT は投稿者側クライアントが10秒後に実行する。
   * ほかの参加者も同じ履歴を見られるよう、全クライアントで少し遅れて再取得する。
   */
  useEffect(() => {
    if (!roomId || !videoId) return;
    const targetVideoId = videoId;
    const t = window.setTimeout(() => {
      if (videoIdRef.current !== targetVideoId) return;
      setPlaybackHistoryRefreshKey((k) => k + 1);
    }, 11500);
    return () => window.clearTimeout(t);
  }, [roomId, videoId]);

  useEffect(() => {
    return () => {
      if (playbackHistoryTimeoutRef.current) clearTimeout(playbackHistoryTimeoutRef.current);
      if (playbackQueueFallbackTimerRef.current) clearTimeout(playbackQueueFallbackTimerRef.current);
    };
  }, []);

  const saveSongHistory = useCallback(
    (videoIdToSave: string, selectionRound: number) => {
      if (isGuest) return;
      const roundSnap = Math.max(1, Math.floor(selectionRound));
      fetch('/api/song-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          videoId: videoIdToSave,
          roomId: roomId ?? '',
          selectionRound: roundSnap,
        }),
      })
        .then((r) => r.json().catch(() => null))
        .then((data) => {
          if (data?.ok && typeof window !== 'undefined') {
            window.dispatchEvent(new Event(USER_SONG_HISTORY_UPDATED_EVENT));
          }
        })
        .catch(() => {});
    },
    [isGuest, roomId]
  );

  const applyImmediateChangeVideo = useCallback(
    (
      id: string,
      publisherClientId: string,
      options?: { preserveReservationQueue?: boolean },
    ) => {
      playbackLog('applyImmediateChangeVideo', { id, publisherClientId });
      trackEndedGraceWindowUntilRef.current = 0;
      if (playbackQueueFallbackTimerRef.current) {
        clearTimeout(playbackQueueFallbackTimerRef.current);
        playbackQueueFallbackTimerRef.current = null;
      }
      const preserve = options?.preserveReservationQueue === true;
      if (!preserve) {
        songReservationQueueRef.current = [];
        syncSongReservationQueueHead();
      }
      const previousVideoId = videoIdRef.current;
      const sameVideoReplay = Boolean(previousVideoId && previousVideoId === id);
      jpDomesticSilenceVideoIdRef.current = null;
      setVideoId(id);
      currentTrackStartedAtMsRef.current = Date.now();
      lastChangeVideoPublisherRef.current = publisherClientId;
      setCurrentSongPosterClientId(publisherClientId);
      const publisherDisplayName =
        participants.find((p) => p.clientId === publisherClientId)?.displayName?.trim() ||
        (publisherClientId === myClientId ? effectiveDisplayName : 'ゲスト');
      /** 他クライアントが guest かは presence に無い。自分が選曲者のときだけ正確に渡す */
      const publisherIsGuestForHistory = publisherClientId === myClientId ? isGuest : false;
      const nextTurnId = resolveNextPresentTurnRef.current(publisherClientId);
      safePublish('changeVideo', {
        type: 'changeVideo',
        videoId: id,
        publisherClientId,
        nextTurnClientId: nextTurnId,
      } as PlaybackMessage);
      playerRef.current?.loadVideoById(id);
      scheduleAutoPlayAfterChangeVideo();
      advanceTurnAfterPost(publisherClientId, nextTurnId);
      fetchAnnounceAndPublish(
        id,
        (sameVideoReplay || isDevMinimalSongAi())
          ? { silent: true, displayNameOverride: publisherDisplayName }
          : { displayNameOverride: publisherDisplayName },
      );
      if (!sameVideoReplay) fetchCommentaryAndPublish(id);
      const roundAtPost = Math.max(1, Math.floor(selectionRoundNumberRef.current));
      if (publisherClientId === myClientId) saveSongHistory(id, roundAtPost);
      schedulePlaybackHistory(
        roomId ?? '',
        id,
        publisherDisplayName,
        publisherIsGuestForHistory,
        roundAtPost,
      );
    },
    [
      participants,
      effectiveDisplayName,
      myClientId,
      isGuest,
      safePublish,
      scheduleAutoPlayAfterChangeVideo,
      advanceTurnAfterPost,
      fetchAnnounceAndPublish,
      fetchCommentaryAndPublish,
      saveSongHistory,
      roomId,
      schedulePlaybackHistory,
      syncSongReservationQueueHead,
    ]
  );

  /** 複数人・5分制限でキューした曲は、原則「いま流れている曲を貼った人」の ended で次曲へ進む。
   * その人のタブが閉じている・YT が ended を出さない場合に備え、最古入室者が遅延フォールバックで適用する。 */
  const QUEUE_APPLY_FALLBACK_MS = 1800;

  useEffect(() => {
    playbackEndedApplyRef.current = () => {
      const pendingVid = pendingQueuedVideoIdRef.current;
      const pendingPub = pendingQueuedPublisherRef.current;
      if (!pendingVid) return;

      /**
       * queueSong 受信直後の microtask では「いま流れている曲の選曲者」＝ imPoster になりうる。
       * 再生中・一時停止中はキューを進めない（実際の ended またはフォールバックタイマーのみ）。
       */
      if (playingRef.current) return;
      const stGuard = playerRef.current?.getPlayerState?.() ?? null;
      if (stGuard !== null && stGuard !== YT_PLAYER_STATE_ENDED) return;

      const poster = lastChangeVideoPublisherRef.current;
      const imPoster = Boolean(myClientId && poster && myClientId === poster);
      const posterInRoom = !!poster && presentClientIdsRef.current.has(poster);
      const imOldest = Boolean(myClientId && oldestRef.current && myClientId === oldestRef.current);

      const tryApplyQueued = () => {
        const qApply = songReservationQueueRef.current;
        const head = qApply[0];
        if (!head?.videoId) return;
        const pv = head.videoId;
        const pp = head.publisherClientId;
        qApply.shift();
        syncSongReservationQueueHead();
        if (playbackQueueFallbackTimerRef.current) {
          clearTimeout(playbackQueueFallbackTimerRef.current);
          playbackQueueFallbackTimerRef.current = null;
        }
        applyingRemoteRef.current = true;
        try {
          applyImmediateChangeVideo(pv, pp || myClientId, { preserveReservationQueue: true });
        } finally {
          setTimeout(() => {
            applyingRemoteRef.current = false;
          }, 300);
        }
      };

      if (imPoster) {
        tryApplyQueued();
        return;
      }

      if (!posterInRoom && imOldest) {
        tryApplyQueued();
        return;
      }

      if (posterInRoom && imOldest) {
        if (playbackQueueFallbackTimerRef.current) {
          clearTimeout(playbackQueueFallbackTimerRef.current);
        }
        const vidSnapshot = pendingVid;
        playbackQueueFallbackTimerRef.current = setTimeout(() => {
          playbackQueueFallbackTimerRef.current = null;
          if (pendingQueuedVideoIdRef.current !== vidSnapshot) return;
          if (myClientId !== oldestRef.current) return;
          tryApplyQueued();
        }, QUEUE_APPLY_FALLBACK_MS);
      }
    };
  }, [myClientId, applyImmediateChangeVideo, syncSongReservationQueueHead]);

  const handleVideoUrlFromChat = useCallback(
    (url: string) => {
      const id = extractVideoId(url);
      if (!id) return;

      // 他の人の曲が再生中のときに、順番外の参加者が検索結果から上書き再生しないように制御
      const currentVid = videoIdRef.current;
      const turnClientId = currentTurnClientIdRef.current;
      const order = participatingOrderRef.current;
      const normalizedNames = order.map(
        (p) => (p.displayName ?? '').trim() || 'ゲスト',
      );
      const uniqueDisplayNameCount = new Set(normalizedNames).size;
      // 別タブ二重接続など「同じ表示名の clientId が複数」だとターンが自分以外扱いになり
      // 「今すぐ貼る」が弾かれる。表示名が全員同一なら実質1人とみなし順番制限をかけない。
      const sameDisplayNameOnly =
        order.length > 1 && uniqueDisplayNameCount === 1;
      const multipleParticipants = order.length > 1 && !sameDisplayNameOnly;
      const isMyTurn = turnClientId && turnClientId === myClientId;

      if (shouldDeferMultiSongPost()) {
        const posterLive = lastChangeVideoPublisherRef.current;
        if (myClientId && posterLive && myClientId === posterLive) {
          addSystemMessage(
            'いま再生中の曲を選んだ方は、この曲が終わるまで予約に追加できません。',
          );
          return;
        }
        if (
          myClientId &&
          songReservationQueueRef.current.some((e) => e.publisherClientId === myClientId)
        ) {
          addSystemMessage('この曲の再生中は、予約はおひとりさま1曲までです。');
          return;
        }
        safePublish('queueSong', {
          type: 'queueSong',
          videoId: id,
          publisherClientId: myClientId,
        } as PlaybackMessage);
        return;
      }

      if (currentVid && multipleParticipants && !isMyTurn && !isOwner) {
        const turnParticipant =
          order.find((p) => p.clientId === turnClientId) ?? null;
        const nameLabel = turnParticipant?.displayName ?? '次の方';
        addSystemMessage(
          `今は${nameLabel}さんの選曲ターンです。曲を変える場合は順番が回ってきてから検索・再生してください。`
        );
        return;
      }

      applyImmediateChangeVideo(id, myClientId);
    },
    [
      safePublish,
      applyImmediateChangeVideo,
      myClientId,
      isOwner,
      addSystemMessage,
      shouldDeferMultiSongPost,
    ]
  );

  const handleAddCandidateFromSearch = useCallback(
    (row: {
      videoId: string;
      title: string;
      channelTitle: string;
      artistTitle: string;
      thumbnailUrl?: string;
    }) => {
      if (candidateSongsRef.current.some((c) => c.videoId === row.videoId)) return;

      const next: CandidateSong = {
        videoId: row.videoId,
        title: row.title,
        channelTitle: row.channelTitle,
        artistTitle: row.artistTitle,
        thumbnailUrl: row.thumbnailUrl,
        addedAt: Date.now(),
      };

      setCandidateSongs((prev) => [...prev, next]);
      addSystemMessage('候補リストに追加しました。自分のターンのときに「候補リスト」から選んで貼れます。');
      triggerCandidateButtonFlash();
    },
    [addSystemMessage, triggerCandidateButtonFlash]
  );

  const handleUseCandidate = useCallback(
    (c: CandidateSong) => {
      // 候補リストに残したまま「貼済み」を表示する（誤投入防止のためボタンも無効化する）
      setCandidateSongs((prev) =>
        prev.map((x) => (x.videoId === c.videoId ? { ...x, usedAt: Date.now() } : x)),
      );

      const url = `https://www.youtube.com/watch?v=${encodeURIComponent(c.videoId)}`;
      handleVideoUrlFromChat(url);
    },
    [handleVideoUrlFromChat]
  );

  const handleRemoveCandidate = useCallback((videoIdToRemove: string) => {
    setCandidateSongs((prev) => prev.filter((c) => c.videoId !== videoIdToRemove));
  }, []);

  const handleClearCandidates = useCallback(() => {
    setCandidateSongs([]);
  }, []);

  const handleSendMessage = useCallback(
    async (text: string) => {
      const limit = checkSendLimit(text, lastSendAtRef, sendTimestampsRef);
      if (!limit.ok) {
        addSystemMessage(getSendLimitMessage(limit.reason));
        return;
      }

      if (isStandaloneNonYouTubeUrl(text)) {
        addSystemMessage(NON_YOUTUBE_URL_SYSTEM_MESSAGE);
        return;
      }

      const id = createMessageId();
      const payload: ChatMessagePayload = {
        id,
        body: text,
        displayName: effectiveDisplayName,
        messageType: 'user',
        createdAt: new Date().toISOString(),
        clientId: myClientId,
      };
      safePublish(CHAT_MESSAGE_EVENT, payload);
      const newUserMsg: ChatMessage = {
        id: payload.id,
        body: payload.body,
        displayName: payload.displayName,
        messageType: payload.messageType,
        createdAt: payload.createdAt,
        clientId: myClientId,
      };
      setMessages((prev) => [...prev, newUserMsg]);
      hasUserSentMessageRef.current = true;
      hasCurrentUserSentMessageSinceLastTidbitRef.current = true;
      tidbitCountSinceUserMessageRef.current = 0;
      lastEndedVideoIdForTidbitRef.current = null;
      touchActivity();
      updateSendTimestamps(lastSendAtRef, sendTimestampsRef);

      if (currentTurnClientIdRef.current === myClientId && isPassPhrase(text)) {
        return;
      }

      const jpUiBlocked =
        jpDomesticSilenceVideoIdRef.current != null &&
        jpDomesticSilenceVideoIdRef.current === videoIdRef.current;

      if (messages.length === 0) {
        if (!jpUiBlocked) {
          const greeting = `${effectiveDisplayName}さん、${getTimeBasedGreeting()}`;
          const localGuide = { allowWhenAiStopped: true, localOnly: true } as const;
          addAiMessage(greeting, localGuide);
          addAiMessage(AI_FIRST_VOICE, localGuide);
        }
        touchActivity();
        return;
      }

      /* 「〇〇さん < おかえり」の歓迎には「おかえりなさい！」だけ返す（API呼び出しなし） */
      if (/さん\s*<\s*おかえり/.test(text.trim())) {
        if (!jpUiBlocked) {
          addAiMessage('おかえりなさい！');
        }
        touchActivity();
        return;
      }

      /* 離席・ROMの意思表明時は API を呼ばない（挨拶メッセージは出さない） */
      if (isLeaveOrRomPhrase(text)) {
        touchActivity();
        return;
      }
      const trimmed = text.trim();
      const aiMentioned = /^[@\uFF20]/.test(trimmed);
      const aiPromptText = aiMentioned ? trimmed.replace(/^[@\uFF20]\s*/, '').trim() : '';
      if (aiMentioned && aiPromptText && isAiTurnOrderClarificationText(aiPromptText)) {
        if (!jpUiBlocked) {
          const reply = buildTurnOrderClarificationReply(
            participatingOrderRef.current,
            currentTurnClientIdRef.current,
          );
          addAiMessage(reply, { allowWhenAiStopped: true });
        }
        touchActivity();
        return;
      }
      if (aiMentioned && aiPromptText) {
        const recentForGuard = [
          ...messages.map((m) => ({
            displayName: m.displayName,
            body: m.body,
            messageType: m.messageType ?? 'user',
          })),
          {
            displayName: effectiveDisplayName,
            body: trimmed,
            messageType: 'user',
          },
        ].slice(-12);
        const guardRes = await resolveAiQuestionMusicRelated(aiPromptText, recentForGuard, {
          isGuest,
          roomId: roomId ?? undefined,
        });
        if (guardRes.outcome === 'defer') {
          addSystemMessage(guardRes.message);
          touchActivity();
          return;
        }
        if (guardRes.outcome === 'block') {
          const message = buildAiQuestionGuardSoftDeclineMessage(effectiveDisplayName);
          const guardPayload: OwnerAiQuestionGuardPayload = {
            targetClientId: myClientId || 'unknown-client',
            targetDisplayName: effectiveDisplayName,
            warningCount: 1,
            yellowCards: 0,
            action: 'warn',
            message,
          };
          applyAiQuestionGuardEvent(guardPayload);
          safePublish(OWNER_AI_QUESTION_GUARD_EVENT, guardPayload);
          touchActivity();
          return;
        }
      }

      const doChatReply = () => {
        const jpS = jpDomesticSilenceVideoIdRef.current;
        const vCur = videoIdRef.current;
        if (jpS != null && vCur != null && jpS === vCur) {
          return;
        }
        const listForAi = [...messages, { ...newUserMsg, body: aiPromptText || newUserMsg.body }].map((m) => ({
          displayName: m.displayName,
          body: m.body,
          messageType: m.messageType,
        }));
        const aiErrorMessage =
          'AI が応答できませんでした。.env.local に GEMINI_API_KEY を設定し、開発サーバーを再起動してください。';
        fetch('/api/ai/chat', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: listForAi,
            videoId: videoId ?? undefined,
            roomId: roomId ?? undefined,
            isGuest,
            forceReply: aiMentioned,
          }),
        })
          .then(async (r) => {
            const data = (await r.json().catch(() => null)) as {
              text?: string;
              skipped?: boolean;
              error?: string;
              message?: string;
            } | null;
            if (r.status === 429 && data?.error === 'rate_limit') {
              addSystemMessage(
                typeof data.message === 'string' && data.message.trim()
                  ? data.message
                  : 'AI への質問が短時間に集中しています。しばらく待ってから再度お試しください。',
              );
              return;
            }
            if (!r.ok) {
              addSystemMessage(aiErrorMessage);
              return;
            }
            if (data?.text) {
              // @で明示的に呼び出した応答は、AI自由発言停止中でも返す
              addAiMessage(data.text, { allowWhenAiStopped: true });
              touchActivity();
            } else if (data?.skipped === true) {
              // 雑談時はサーバー側で意図的に無応答（エラー表示しない）
            } else {
              addSystemMessage(aiErrorMessage);
            }
          })
          .catch(() => addSystemMessage(aiErrorMessage));
      };

      if (pendingSongQueryRef.current && isShortConfirmation(text)) {
        if (!isYoutubeKeywordSearchEnabled()) {
          pendingSongQueryRef.current = null;
          pendingSongConfirmationTextRef.current = null;
          addSystemMessage(
            'キーワードでの曲検索は現在オフです。YouTube の動画 URL をコピーして貼り、「送信」で選曲してください。',
          );
          touchActivity();
          return;
        }
        const query = pendingSongQueryRef.current;
        const confirmationText = pendingSongConfirmationTextRef.current;
        pendingSongQueryRef.current = null;
        pendingSongConfirmationTextRef.current = null;
        fetch('/api/ai/paste-by-query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, isGuest }),
        })
          .then(async (r2) => {
            const data2 = (await r2.json().catch(() => null)) as {
              ok?: boolean;
              videoId?: string;
              artistTitle?: string;
              error?: string;
              message?: string;
            } | null;
            if (r2.status === 429 && data2?.error === 'rate_limit') {
              addSystemMessage(
                typeof data2.message === 'string' && data2.message.trim()
                  ? data2.message
                  : 'YouTube検索の操作が短時間に集中しています。しばらく待ってから再度お試しください。',
              );
              return;
            }
            if (data2?.ok && data2?.videoId && data2?.artistTitle) {
              if (shouldDeferMultiSongPost()) {
                const posterLive = lastChangeVideoPublisherRef.current;
                if (myClientId && posterLive && myClientId === posterLive) {
                  addSystemMessage(
                    'いま再生中の曲を選んだ方は、この曲が終わるまで予約に追加できません。',
                  );
                  touchActivity();
                  return;
                }
                if (
                  myClientId &&
                  songReservationQueueRef.current.some((e) => e.publisherClientId === myClientId)
                ) {
                  addSystemMessage('この曲の再生中は、予約はおひとりさま1曲までです。');
                  touchActivity();
                  return;
                }
                safePublish('queueSong', {
                  type: 'queueSong',
                  videoId: data2.videoId,
                  publisherClientId: myClientId,
                } as PlaybackMessage);
                touchActivity();
                return;
              }
              applyImmediateChangeVideo(data2.videoId, myClientId);
              addAiMessage(`${data2.artistTitle} を貼りました！`);
              touchActivity();
            } else {
              const searchKeyword = confirmationText ?? query;
              if (searchKeyword) addSystemMessage('曲が見つかりませんでした。下のボタンでYouTube検索を開けます。', searchKeyword);
              doChatReply();
            }
          })
          .catch(() => {
            const searchKeyword = confirmationText ?? query;
            if (searchKeyword) addSystemMessage('曲が見つかりませんでした。下のボタンでYouTube検索を開けます。', searchKeyword);
            doChatReply();
          });
        return;
      }

      if (!aiMentioned) {
        touchActivity();
        return;
      }
      if (!aiPromptText) {
        addSystemMessage('AIへの質問は「@ 質問内容」の形で入力してください。');
        touchActivity();
        return;
      }

      fetch('/api/ai/resolve-song-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: aiPromptText,
          roomId: roomId ?? undefined,
          recentMessages: messages.slice(-6).map((m) => ({
            displayName: m.displayName,
            body: m.body,
            messageType: m.messageType,
          })),
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.needConfirm && data?.confirmationText && data?.query) {
            if (!isYoutubeKeywordSearchEnabled()) {
              addSystemMessage(
                'キーワードでの曲検索は現在オフです。YouTube の動画 URL をコピーして貼り、「送信」で選曲するか、曲について @ で質問してください。',
              );
              touchActivity();
              return;
            }
            pendingSongQueryRef.current = data.query;
            pendingSongConfirmationTextRef.current = data.confirmationText;
            const jpB =
              jpDomesticSilenceVideoIdRef.current != null &&
              jpDomesticSilenceVideoIdRef.current === videoIdRef.current;
            if (!jpB) {
              addAiMessage(
                `${data.confirmationText} ですね？曲を再生するには、入力欄のまま「検索」ボタンを押して一覧から動画を選んでください。（送信だけでは再生されません）`,
              );
            }
            touchActivity();
            return;
          }
          doChatReply();
        })
        .catch(() => doChatReply());
    },
    [
      safePublish,
      messages,
      videoId,
      addAiMessage,
      addSystemMessage,
      touchActivity,
      roomId,
      myClientId,
      applyImmediateChangeVideo,
      applyAiQuestionGuardEvent,
      effectiveDisplayName,
      isGuest,
      shouldDeferMultiSongPost,
    ]
  );

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-gray-950 p-3">
      <header className="mb-2 flex shrink-0 flex-row items-center justify-between gap-2 border-b border-gray-800 pb-2 sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Image
            src="/music_ai_chat_wh.png"
            alt=""
            width={180}
            height={36}
            className="h-9 w-auto max-h-9 shrink-0 object-contain object-left"
            priority
          />
          <h1
            className="min-w-0 flex-1 truncate text-base font-semibold leading-none text-white sm:text-lg"
            title={`部屋 ${roomId || '--'}${(roomDisplayTitleCurrent || roomTitle) ? ` - ${roomDisplayTitleCurrent || roomTitle}` : ''}`}
          >
            {`部屋 ${roomId || '--'}${(roomDisplayTitleCurrent || roomTitle) ? ` - ${roomDisplayTitleCurrent || roomTitle}` : ''}`}
          </h1>
        </div>
        {onLeave && (
          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5 sm:gap-2">
            {!isGuest && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setPolicyTab('terms');
                    setTermsModalOpen(true);
                  }}
                  className="inline-flex shrink-0 items-center gap-0 text-xs text-gray-300 hover:text-white lg:gap-0.5 lg:whitespace-nowrap sm:text-sm"
                  title="利用規約"
                  aria-label="利用規約"
                >
                  <DocumentTextIcon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="hidden underline decoration-dotted underline-offset-2 lg:inline">
                    利用規約
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSiteFeedbackOpen(true)}
                  className="inline-flex items-center gap-1 text-sm text-gray-300 underline decoration-dotted underline-offset-2 hover:text-white"
                  title="このサイトへのご意見"
                  aria-label="このサイトへのご意見"
                >
                  <EnvelopeIcon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="hidden lg:inline">ご意見</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const supabase = createClient();
                    if (supabase) await supabase.auth.signOut();
                    onLeave();
                  }}
                  className="rounded border border-amber-700 bg-amber-900/40 px-3 py-2 text-sm text-amber-200 hover:bg-amber-800/60"
                  aria-label="ログアウトして最初の画面に戻る"
                >
                  ログアウト
                </button>
              </>
            )}
            {isGuest && (
              <button
                type="button"
                onClick={() => setSiteFeedbackOpen(true)}
                className="inline-flex items-center gap-1 text-sm text-gray-300 underline decoration-dotted underline-offset-2 hover:text-white"
                title="このサイトへのご意見"
                aria-label="このサイトへのご意見"
              >
                <EnvelopeIcon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="hidden lg:inline">ご意見</span>
              </button>
            )}
            <button
              type="button"
              onClick={onLeave}
              className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 hover:text-white"
              aria-label="部屋を退室して最初の画面に戻る"
            >
              退室
            </button>
          </div>
        )}
      </header>

      <section className="mb-1 shrink-0">
        <UserBar
          displayName={effectiveDisplayName}
          isGuest={isGuest}
          onGuestRegisterClick={isGuest ? () => setGuestRegisterModalOpen(true) : undefined}
          onMyPageClick={() => setMyPageOpen(true)}
          onPlaybackHistoryClick={isLg ? undefined : () => setPlaybackHistoryModalOpen(true)}
          currentVideoId={videoId}
          favoritedVideoIds={favoritedVideoIds}
          onFavoriteCurrentClick={handleFavoriteCurrentClick}
          participants={participants}
          myClientId={myClientId}
          currentOwnerClientId={ownerLeftAt === null ? ownerClientId : ''}
          currentSongPosterClientId={currentSongPosterClientId}
          queuedSongPublisherClientIds={queuedSongPublisherClientIds}
          nextTurnClientId={currentTurnClientId}
          selectionRoundNumber={selectionRoundNumber}
          skipCurrentTrackActive={Boolean(
            videoId &&
              currentSongPosterClientId &&
              myClientId &&
              skipUsedForVideoId !== videoId &&
              (myClientId === currentSongPosterClientId ||
                canUseOwnerControls),
          )}
          skipCurrentTrackDisabled={Boolean(
            videoId && currentSongPosterClientId && myClientId &&
              !(
                myClientId === currentSongPosterClientId ||
                canUseOwnerControls
              ),
          )}
          onSkipCurrentTrack={handleSkipCurrentTrack}
          onCancelSongReservation={handleRequestCancelSongReservation}
          onParticipantClick={(displayName) => chatInputRef.current?.insertText(` ${displayName}さん `)}
          viewerIsGuest={isGuest}
          onParticipantPublicProfileClick={({ authUserId, displayName: dn }) =>
            setParticipantPublicProfileModal({ userId: authUserId, displayName: dn })
          }
        />
      </section>

      <ParticipantPublicProfileModal
        open={participantPublicProfileModal != null}
        onClose={() => setParticipantPublicProfileModal(null)}
        targetUserId={participantPublicProfileModal?.userId ?? null}
        displayName={participantPublicProfileModal?.displayName ?? ''}
        viewerIsGuest={isGuest}
      />

      {cancelReservationModalOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-reservation-title"
          onClick={() => setCancelReservationModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-600 bg-gray-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cancel-reservation-title" className="text-lg font-semibold text-gray-100">
              選曲予約を取り消しますか？
            </h2>
            <p className="mt-2 text-sm text-gray-300">
              取り消したあと、再度予約するときは下の入力欄に YouTube の URL を貼って送信してください。
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                onClick={() => setCancelReservationModalOpen(false)}
              >
                戻る
              </button>
              <button
                type="button"
                className="rounded border border-sky-700 bg-sky-900/50 px-4 py-2 text-sm font-medium text-sky-100 hover:bg-sky-800/60"
                onClick={handleConfirmCancelSongReservation}
              >
                取り消す
              </button>
            </div>
          </div>
        </div>
      )}

      <SiteFeedbackModal
        open={siteFeedbackOpen}
        onClose={() => setSiteFeedbackOpen(false)}
        roomId={roomId}
        displayName={effectiveDisplayName}
      />

      <GuestRegisterPromptModal
        open={guestRegisterModalOpen}
        onClose={() => setGuestRegisterModalOpen(false)}
        roomId={roomId}
      />

      {myPageOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="マイページ"
        >
          <div className="max-h-full max-w-md overflow-auto">
            <MyPage
              onClose={() => setMyPageOpen(false)}
              currentUserTextColor={userTextColor}
              onUserTextColorChange={(color) => {
                setUserTextColor(color);
                try {
                  localStorage.setItem(CHAT_TEXT_COLOR_STORAGE_KEY, color);
                } catch {}
              }}
              chatOwnerTransferParticipants={
                canUseOwnerControls
                  ? participants.filter((p) => p.clientId !== myClientId && !p.isAway)
                  : undefined
              }
              currentOwnerClientId={ownerClientId}
              myClientId={myClientId}
              isChatOwner={canUseOwnerControls}
              onTransferOwner={
                canUseOwnerControls
                  ? (newOwnerClientId) => {
                      const newOwnerDisplayName =
                        participants.find((p) => p.clientId === newOwnerClientId)?.displayName?.trim() || 'ゲスト';
                      const next = { ownerClientId: newOwnerClientId, ownerLeftAt: null };
                      setOwnerState(next);
                      if (roomId) setOwnerStateToStorage(roomId, next);
                      safePublish(OWNER_STATE_EVENT, next as OwnerStatePayload);
                      addAiMessage(`${newOwnerDisplayName}さんオーナー引き継ぎ`, {
                        allowWhenAiStopped: true,
                      });
                      setMyPageOpen(false);
                    }
                  : undefined
              }
              isGuest={isGuest}
              guestDisplayName={effectiveDisplayName}
              onGuestDisplayNameChange={isGuest ? setGuestDisplayName : undefined}
              participatesInSelection={participatesInSelection}
              onParticipatesInSelectionChange={setParticipatesInSelection}
              joinEntryChimeEnabled={joinEntryChimeEnabled}
              onJoinEntryChimeEnabledChange={setJoinEntryChimeEnabled}
              userStatus={userStatus}
              onUserStatusChange={setUserStatus}
              songLimit5MinEnabled={songLimit5MinEnabled}
              onSongLimit5MinToggle={
                canUseOwnerControls
                  ? () => {
                      const next = !songLimit5MinEnabled;
                      setSongLimit5MinEnabled(next);
                      safePublish(OWNER_5MIN_LIMIT_EVENT, { enabled: next } as Owner5MinLimitPayload);
                    }
                  : undefined
              }
              aiFreeSpeechStopped={aiFreeSpeechStopped}
              onAiFreeSpeechStopToggle={
                canUseOwnerControls
                  ? () => {
                      const next = !aiFreeSpeechStopped;
                      setAiFreeSpeechStopped(next);
                      safePublish(OWNER_AI_FREE_SPEECH_STOP_EVENT, {
                        enabled: next,
                      } as OwnerAiFreeSpeechStopPayload);
                    }
                  : undefined
              }
              onForceExit={
                canUseOwnerControls
                  ? (targetClientId, targetDisplayName) => {
                      safePublish(OWNER_FORCE_EXIT_EVENT, {
                        targetClientId,
                        targetDisplayName,
                      } as OwnerForceExitPayload);
                    }
                  : undefined
              }
              onOwnerSetParticipantSelection={
                canUseOwnerControls
                  ? (targetClientId, targetDisplayName, nextParticipates) => {
                      safePublish(OWNER_SET_PARTICIPANT_SELECTION_EVENT, {
                        targetClientId,
                        targetDisplayName,
                        participatesInSelection: nextParticipates,
                      } as OwnerSetParticipantSelectionPayload);
                    }
                  : undefined
              }
              roomId={roomId}
              onRoomProfileSaved={({ displayTitle }) => setRoomDisplayTitleCurrent(displayTitle)}
              commentPackSlots={commentPackSlots}
              onCommentPackSlotsChange={
                canUseOwnerControls
                  ? (nextSlots) => {
                      const slots = canonicalCommentPackSlots(nextSlots);
                      const sentAt = Date.now();
                      commentPackSlotsSentAtRef.current = sentAt;
                      commentPackSlotsRef.current = slots;
                      setCommentPackSlots(slots);
                      const rid = roomId?.trim();
                      if (rid) setCommentPackModeToStorage(rid, slots);
                      safePublish(OWNER_COMMENT_PACK_MODE_EVENT, {
                        slots,
                        sentAt,
                      } as OwnerCommentPackModePayload);
                    }
                  : undefined
              }
              jpAiUnlockEnabled={jpAiUnlockEnabled}
              onJpAiUnlockToggle={
                canUseOwnerControls
                  ? () => {
                      const next = !jpAiUnlockEnabledRef.current;
                      jpAiUnlockEnabledRef.current = next;
                      setJpAiUnlockEnabled(next);
                      safePublish(OWNER_JP_AI_UNLOCK_EVENT, {
                        enabled: next,
                      } as OwnerJpAiUnlockPayload);
                    }
                  : undefined
              }
            />
          </div>
        </div>
      )}

      {chatSummaryModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="チャットサマリー"
          onClick={() => setChatSummaryModalOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-lg border border-gray-700 bg-gray-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">チャットサマリー</h2>
              <button
                type="button"
                onClick={() => setChatSummaryModalOpen(false)}
                className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
              >
                閉じる
              </button>
            </div>
            {chatSummaryLoading ? (
              <p className="text-sm text-gray-400">読み込み中…</p>
            ) : chatSummaryError ? (
              <p className="text-sm text-amber-300">{chatSummaryError}</p>
            ) : chatSummary ? (
              <div className="space-y-2 text-sm">
                <p className="text-gray-300">対象枠: {chatSummary.sessionWindowLabel || '—'}</p>
                <p className="text-gray-100">{chatSummary.summaryText}</p>
                <p className="text-gray-300">参加者: {(chatSummary.participants ?? []).join('、') || '—'}</p>
                <p className="text-gray-300">
                  選曲数: {(chatSummary.participantSongCounts ?? []).map((v) => `${v.displayName}(${v.count})`).join(' / ') || '—'}
                </p>
                <p className="text-gray-300">
                  時代分布: {(chatSummary.eraDistribution ?? []).map((v) => `${v.era}(${v.count})`).join(' / ') || '—'}
                </p>
                <p className="text-gray-300">
                  スタイル分布: {(chatSummary.styleDistribution ?? []).map((v) => `${v.style}(${v.count})`).join(' / ') || '—'}
                </p>
                <p className="text-gray-300">
                  人気アーティスト: {(chatSummary.popularArtists ?? []).map((v) => `${v.artist}(${v.count})`).join(' / ') || '—'}
                </p>
                <p className="text-gray-300">
                  人気曲: {(chatSummary.popularTracks ?? []).map((v) => `${v.artist} - ${v.title} (${v.count})`).join(' / ') || '—'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">データがありません。</p>
            )}
          </div>
        </div>
      )}

      {termsModalOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="利用規約"
          onClick={() => setTermsModalOpen(false)}
        >
          <div
            className="h-[85vh] w-full max-w-5xl overflow-hidden rounded-lg border border-gray-700 bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-700 px-3 py-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPolicyTab('terms')}
                  className={`rounded px-2.5 py-1 text-xs ${
                    policyTab === 'terms'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  利用規約
                </button>
                <button
                  type="button"
                  onClick={() => setPolicyTab('privacy')}
                  className={`rounded px-2.5 py-1 text-xs ${
                    policyTab === 'privacy'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  プライバシー
                </button>
                <button
                  type="button"
                  onClick={() => setPolicyTab('guide')}
                  className={`rounded px-2.5 py-1 text-xs ${
                    policyTab === 'guide'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  ご利用上の注意
                </button>
              </div>
              <button
                type="button"
                onClick={() => setTermsModalOpen(false)}
                className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
              >
                閉じる
              </button>
            </div>
            <iframe
              src={
                policyTab === 'terms'
                  ? '/terms?modal=1'
                  : policyTab === 'privacy'
                    ? '/privacy?modal=1'
                    : `/guide?modal=1${
                        roomId?.trim()
                          ? `&returnTo=${encodeURIComponent(roomId.trim())}`
                          : ''
                      }`
              }
              title="ポリシー"
              className="h-[calc(85vh-46px)] w-full border-0 bg-gray-950"
            />
          </div>
        </div>
      )}

      <RoomMainLayout
        desktopSwapColumns
        left={
          <Chat
            messages={messages}
            currentUserDisplayName={effectiveDisplayName}
            userTextColor={userTextColor}
            participantTextColors={Object.fromEntries(
              participants.filter((p) => p.textColor).map((p) => [p.clientId, p.textColor!])
            )}
            participantsWithColor={participants
              .filter((p) => p.textColor)
              .map((p) => ({ displayName: p.displayName, textColor: p.textColor }))}
            currentVideoId={videoId}
            canRejectTidbit={canRejectTidbit && !isGuest}
            onTidbitLibraryReject={handleTidbitLibraryReject}
            onChatSummaryClick={roomId ? openChatSummaryModal : undefined}
            jpAiUnlockEnabled={jpAiUnlockEnabled}
            roomId={roomId ?? undefined}
            myClientId={myClientId || undefined}
            styleAdminChatTools={chatStyleAdminTools}
            onYoutubeSearchFromAi={
              isYoutubeKeywordSearchEnabled()
                ? (q) => chatInputRef.current?.searchYoutubeWithQuery(q)
                : undefined
            }
          />
        }
        rightTop={
          <YouTubePlayer
            ref={playerRef}
            videoId={videoId}
            onStateChange={handlePlayerStateChange}
          />
        }
        rightBottom={
          <RoomPlaybackHistory
            roomId={roomId}
            roomClientId={myClientId}
            currentVideoId={videoId}
            refreshKey={playbackHistoryRefreshKey}
            participantsWithColor={participants
              .filter((p) => p.textColor)
              .map((p) => ({ displayName: p.displayName, textColor: p.textColor! }))}
            isGuest={isGuest}
            favoritedVideoIds={favoritedVideoIds}
            onFavoriteClick={handleFavoriteClick}
            onRegenerateAiAfterPlaybackTitleSave={regenerateAiSongIntroAfterPlaybackTitleSave}
          />
        }
        playbackHistoryModalOpen={playbackHistoryModalOpen}
        onPlaybackHistoryModalClose={() => setPlaybackHistoryModalOpen(false)}
      />

      <section className="mt-2 shrink-0">
        <ChatInput
          ref={chatInputRef}
          onSendMessage={handleSendMessage}
          onVideoUrl={handleVideoUrlFromChat}
          isGuest={isGuest}
          onSystemMessage={addSystemMessage}
          onAddCandidate={
            isYoutubeKeywordSearchEnabled() ? handleAddCandidateFromSearch : undefined
          }
          onPreviewStart={handlePreviewStart}
          onPreviewStop={handlePreviewStop}
          onClearLocalAiQuestionGuard={
            chatStyleAdminTools ? clearLocalAiQuestionGuardState : undefined
          }
          trailingSlot={
            isYoutubeKeywordSearchEnabled() ? (
              <button
                type="button"
                className={`flex h-[3.75rem] w-full shrink-0 items-center justify-center gap-0.5 rounded border border-emerald-600 bg-emerald-900/40 px-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-800/70 lg:w-auto lg:px-3 ${
                  candidateButtonFlash ? 'animate-pulse ring-2 ring-emerald-300' : ''
                }`}
                onClick={() => setCandidateOpen(true)}
              >
                候補リスト
                {candidateSongs.length > 0 && (
                  <span className="inline-block rounded bg-emerald-700 px-1 text-[10px]">
                    {candidateSongs.length}
                  </span>
                )}
              </button>
            ) : undefined
          }
        />
      </section>

      {candidateOpen && isYoutubeKeywordSearchEnabled() && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="候補リスト"
          onClick={() => setCandidateOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded border border-gray-700 bg-gray-900 p-4 text-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">自分の候補リスト</div>
              <div className="flex items-center gap-2">
                {candidateSongs.length > 0 && (
                  <button
                    type="button"
                    className="rounded border border-red-700 bg-red-900/40 px-2 py-1 text-xs text-red-100 hover:bg-red-800/70"
                    onClick={handleClearCandidates}
                  >
                    全て削除
                  </button>
                )}
                <button
                  type="button"
                  className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700"
                  onClick={() => setCandidateOpen(false)}
                >
                  閉じる
                </button>
              </div>
            </div>
            {candidateSongs.length === 0 ? (
              <p className="text-xs text-gray-400">
                まだ候補はありません。「検索」→各結果の「候補」ボタンで、次に貼りたい曲をここへ貯めておけます。
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto">
                <ul className="space-y-2">
                  {candidateSongs
                    .slice()
                    .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
                    .map((c) => (
                      <li key={c.videoId}>
                        <div className="flex items-center gap-3 rounded border border-gray-700 bg-gray-800/60 px-3 py-2">
                          {c.thumbnailUrl && (
                            <div
                              className={`h-12 w-20 flex-shrink-0 overflow-hidden rounded bg-black/40 ${
                                c.usedAt ? 'grayscale saturate-0 opacity-70' : ''
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={c.thumbnailUrl}
                                alt={c.title || c.artistTitle}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          )}
                          <div
                            className={`min-w-0 flex-1 ${
                              c.usedAt ? 'grayscale saturate-0 opacity-70' : ''
                            }`}
                          >
                            <div className="text-sm font-medium text-gray-100 line-clamp-1">
                              {c.artistTitle}
                            </div>
                          {c.usedAt && (
                            <div className="mt-1 text-[10px] font-semibold text-emerald-200">
                              貼済み
                            </div>
                          )}
                            <div className="mt-0.5 text-xs text-gray-400 line-clamp-2">
                              {c.title} / {c.channelTitle}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              className="rounded border border-blue-500/70 bg-blue-900/40 px-2 py-1 text-xs text-blue-100 hover:bg-blue-900/70"
                              onClick={() => {
                                handleUseCandidate(c);
                                setCandidateOpen(false);
                              }}
                            >
                              貼る
                            </button>
                            <button
                              type="button"
                              className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-700"
                              onClick={() => handleRemoveCandidate(c.videoId)}
                            >
                              削除
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
