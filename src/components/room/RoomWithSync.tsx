'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChannel, usePresence, usePresenceListener } from 'ably/react';
import Chat from '@/components/chat/Chat';
import ChatInput, { type ChatInputHandle } from '@/components/chat/ChatInput';
import YouTubePlayer, {
  type YouTubePlayerHandle,
} from '@/components/player/YouTubePlayer';
import MyPage from '@/components/mypage/MyPage';
import ResizableSection from '@/components/room/ResizableSection';
import RoomPlaybackHistory from '@/components/room/RoomPlaybackHistory';
import UserBar from '@/components/room/UserBar';
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
import { NON_YOUTUBE_URL_SYSTEM_MESSAGE } from '@/lib/chat-non-youtube-url';
import { COMMENT_PACK_MAX_FREE_COMMENTS } from '@/lib/song-tidbits';
import { extractVideoId, isStandaloneNonYouTubeUrl } from '@/lib/youtube';
import type { PlaybackMessage } from '@/types/playback';
import {
  CHAT_MESSAGE_EVENT,
  type ChatMessage,
  type ChatMessagePayload,
} from '@/types/chat';
import {
  OWNER_FORCE_EXIT_EVENT,
  OWNER_AI_FREE_SPEECH_STOP_EVENT,
  OWNER_STATE_EVENT,
  TURN_STATE_EVENT,
  OWNER_5MIN_LIMIT_EVENT,
  type OwnerForceExitPayload,
  type OwnerAiFreeSpeechStopPayload,
  type OwnerStatePayload,
  type TurnStatePayload,
  type Owner5MinLimitPayload,
} from '@/types/room-owner';
import {
  setKicked,
  OWNER_ABSENCE_MS,
  getOwnerStateFromStorage,
  setOwnerStateToStorage,
} from '@/lib/room-owner';
import { createClient } from '@/lib/supabase/client';

const AI_DISPLAY_NAME = 'AI';
const SILENCE_TIDBIT_SEC = 30;
/** 他メンバーの「再生」で巻き戻ししない閾値（秒）。有料/無料で広告の有無により終了時刻がずれるため、遅れた再生は適用しない */
const PLAY_SYNC_REWIND_THRESHOLD_SEC = 10;
/** 曲投入後の自動再生まで待つ時間（ミリ秒）。読み込み完了を待つためやや長め */
const AUTO_PLAY_AFTER_CHANGE_VIDEO_MS = 1200;

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

/** 離席・ROM（無言）の意思表明か。このときAIは「〇〇さん、いってらっしゃいませ」と返す */
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

/** AIの第一声（参加者へのルーム説明） */
const AI_FIRST_VOICE =
  '洋楽好きで一緒に楽しむチャットルームです。参加者が順番にYouTubeから曲を貼って一緒に鑑賞します。投稿する動画は洋楽の曲・MV・ライブ映像など音楽コンテンツに限ってください（洋楽以外の動画は控えてください）。洋楽ならジャンルや時代は自由です。よろしくお願いします！';
/** 選曲順の説明 */
const TURN_ORDER_VOICE = '入室した順（参加者欄の左から）で曲を貼っていきます。';
const TIDBIT_COOLDOWN_SEC = 60;

function createMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface PresenceMemberData {
  displayName?: string;
  /** 選曲に参加するか。false なら視聴専用。デフォルト true */
  participatesInSelection?: boolean;
  /** チャットでの自分のテキスト色（参加者欄の名前色に反映） */
  textColor?: string;
  /** 自分のステータス（離席・ROM・食事中など）。参加者名横に表示 */
  status?: string;
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

interface RoomWithSyncProps {
  displayName?: string;
  channelName: string;
  roomId?: string;
  isGuest?: boolean;
  onLeave?: () => void;
  clientId?: string;
}

export default function RoomWithSync({
  displayName: displayNameProp = 'ゲスト',
  channelName,
  roomId,
  isGuest = false,
  onLeave,
  clientId: myClientId = '',
}: RoomWithSyncProps) {
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const applyingRemoteRef = useRef(false);
  const autoPlayAfterChangeVideoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [myPageOpen, setMyPageOpen] = useState(false);
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
  const nextPromptShownForVideoIdRef = useRef<string | null>(null);
  const initialGreetingDoneRef = useRef(false);
  const zeroSongPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 定期「どなたでも…」のコールバック内で最新人数を参照する */
  const participantsCountForPromptRef = useRef(0);
  /** 現在再生中の曲を貼った人の clientId（次の曲促しを誰が出すか） */
  const lastChangeVideoPublisherRef = useRef('');
  const fiveMinLimitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const songLimit5MinEnabledRef = useRef(true);
  const lastSendAtRef = useRef(0);
  const sendTimestampsRef = useRef<number[]>([]);
  const playbackHistoryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playbackHistoryRefreshKey, setPlaybackHistoryRefreshKey] = useState(0);
  const [favoritedVideoIds, setFavoritedVideoIds] = useState<string[]>([]);
  const recentlyUsedTidbitIdsRef = useRef<string[]>([]);
  const tidbitCountSinceUserMessageRef = useRef(0);
  const lastEndedVideoIdForTidbitRef = useRef<string | null>(null);
  /** 曲解説表示後の自由発言でメインアーティスト優先にする残り回数（1〜2回） */
  const tidbitPreferMainArtistLeftRef = useRef(0);
  /** comment-pack を表示した動画ID。次の曲まで同じ曲の豆知識を出さず一般豆知識にする（重複解説を防ぐ） */
  const commentPackVideoIdRef = useRef<string | null>(null);
  /** 自分が発言したか（ステータスありでも発言あれば在席とみなして豆知識を出す） */
  const hasCurrentUserSentMessageSinceLastTidbitRef = useRef(false);
  const [aiFreeSpeechStopped, setAiFreeSpeechStopped] = useState(false);
  const [ownerState, setOwnerState] = useState<{ ownerClientId: string; ownerLeftAt: number | null }>(() =>
    roomId ? getOwnerStateFromStorage(roomId) ?? { ownerClientId: '', ownerLeftAt: null } : { ownerClientId: '', ownerLeftAt: null }
  );
  const ownerStatePublishRef = useRef(false);
  const currentTurnClientIdRef = useRef('');
  const participatingOrderRef = useRef<{ clientId: string; displayName: string }[]>([]);
  /** ゲスト用の表示名（マイページで変更可能）。非ゲストは displayNameProp をそのまま使う */
  const [guestDisplayName, setGuestDisplayName] = useState(displayNameProp);
  const effectiveDisplayName = isGuest ? guestDisplayName : displayNameProp;
  /** 選曲に参加するか。false なら視聴専用。デフォルト true */
  const [participatesInSelection, setParticipatesInSelection] = useState(true);
  /** 今誰の選曲番か（clientId）。空は未定・曲0本時など */
  const [currentTurnClientId, setCurrentTurnClientId] = useState('');
  /** 今流れている曲を貼った人（選曲者）の clientId。参加者欄でアクティブ表示 */
  const [currentSongPosterClientId, setCurrentSongPosterClientId] = useState('');
  /** オーナーによる5分制限。デフォルトON。そのセッションのみ */
  const [songLimit5MinEnabled, setSongLimit5MinEnabled] = useState(true);
  songLimit5MinEnabledRef.current = songLimit5MinEnabled;
  videoIdRef.current = videoId;
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

  const candidateSongsRef = useRef<CandidateSong[]>(candidateSongs);
  useEffect(() => {
    candidateSongsRef.current = candidateSongs;
  }, [candidateSongs]);

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

  const presencePayload: PresenceMemberData = {
    displayName: effectiveDisplayName,
    participatesInSelection,
    textColor: userTextColor,
    status: userStatus || undefined,
  };
  const { updateStatus } = usePresence(channelName, presencePayload);
  const { presenceData } = usePresenceListener<PresenceMemberData>(channelName);

  useEffect(() => {
    updateStatus(presencePayload);
  }, [updateStatus, effectiveDisplayName, participatesInSelection, userTextColor, userStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(candidateStorageKey, JSON.stringify(candidateSongs));
    } catch {
      // ignore
    }
  }, [candidateSongs, candidateStorageKey]);
  /** 入室した順（timestamp 昇順）の参加者一覧 */
  const participants = useMemo(() => {
    return [...presenceData]
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
      .map((p) => ({
        clientId: p.clientId,
        displayName: (p.data?.displayName ?? 'ゲスト').trim() || 'ゲスト',
        participatesInSelection: p.data?.participatesInSelection !== false,
        timestamp: p.timestamp ?? 0,
        textColor: typeof p.data?.textColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.data.textColor) ? p.data.textColor : undefined,
        status: typeof p.data?.status === 'string' && p.data.status.trim() ? p.data.status.trim() : undefined,
      }));
  }, [presenceData]);
  /** 選曲に参加する人のみ・入室順（左から1,2,3...の番号に対応） */
  const participatingOrder = useMemo(
    () => participants.filter((p) => p.participatesInSelection),
    [participants]
  );
  participantsCountForPromptRef.current = participants.length;
  /** 次の選曲者 clientId を取得（参加者リストで次の人、末尾なら先頭に戻る） */
  const getNextTurnClientId = useCallback(
    (afterClientId: string): string => {
      if (participatingOrder.length === 0) return '';
      const i = participatingOrder.findIndex((p) => p.clientId === afterClientId);
      const nextIndex = i < 0 ? 0 : (i + 1) % participatingOrder.length;
      return participatingOrder[nextIndex]?.clientId ?? '';
    },
    [participatingOrder]
  );

  currentTurnClientIdRef.current = currentTurnClientId;
  participatingOrderRef.current = participatingOrder;
  const oldestParticipantClientId = useMemo(() => {
    if (participants.length === 0) return '';
    const sorted = [...participants].sort((a, b) => a.timestamp - b.timestamp);
    return sorted[0].clientId;
  }, [participants]);

  const ownerClientId = ownerState.ownerClientId;
  const ownerLeftAt = ownerState.ownerLeftAt;
  const isOwner = Boolean(myClientId && ownerClientId && myClientId === ownerClientId && ownerLeftAt === null);

  const publishRef = useRef<((name: string, data: unknown) => void) | null>(null);

  const ownerLeftAtRef = useRef(ownerLeftAt);
  const oldestRef = useRef(oldestParticipantClientId);
  ownerLeftAtRef.current = ownerLeftAt;
  oldestRef.current = oldestParticipantClientId;
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

  const isShortConfirmation = (t: string) =>
    /^(はい|うん|ええ|お願い|そうです|お願いします|いいです|お願いね|はい!?|うん!?|ええ!?)$/i.test(t.trim());

  const touchActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now();
  }, []);

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
      return;
    }
    if (message.name === OWNER_5MIN_LIMIT_EVENT) {
      const d = message.data as Owner5MinLimitPayload;
      if (d && typeof d.enabled === 'boolean') {
        setSongLimit5MinEnabled(d.enabled);
      }
      return;
    }
    if (message.name === CHAT_MESSAGE_EVENT) {
      lastActivityAtRef.current = Date.now();
      const data = message.data as ChatMessagePayload & { clientId?: string };
      if (!data?.id || !data?.body) return;
      if (data.messageType === 'user') {
        hasUserSentMessageRef.current = true;
        tidbitCountSinceUserMessageRef.current = 0;
        lastEndedVideoIdForTidbitRef.current = null;
        const senderId = data.clientId ?? '';
        if (senderId && senderId === currentTurnClientIdRef.current && isPassPhrase(data.body)) {
          const order = participatingOrderRef.current;
          const cur = currentTurnClientIdRef.current;
          const i = order.findIndex((p) => p.clientId === cur);
          const nextIndex = order.length === 0 ? 0 : (i < 0 ? 0 : i + 1) % order.length;
          const nextParticipant = order[nextIndex];
          const nextId = nextParticipant?.clientId ?? '';
          if (senderId === myClientId) {
            safePublish(TURN_STATE_EVENT, { currentTurnClientId: nextId } as TurnStatePayload);
            const nextDisplayName = nextParticipant?.displayName ?? '次の方';
            addAiMessage(`${nextDisplayName}さん、次の曲を貼ってください`, { allowWhenAiStopped: true });
          }
        }
        /* 離席・ROMの意思表明には「〇〇さん、いってらっしゃいませ」とAIが返す（全員の画面に表示） */
        if (isLeaveOrRomPhrase(data.body)) {
          const senderName = data.displayName?.trim() || 'ゲスト';
          addAiMessage(`${senderName}さん、いってらっしゃいませ`, { allowWhenAiStopped: true });
        }
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [
          ...prev,
          {
            id: data.id,
            body: data.body,
            displayName: data.displayName ?? 'ゲスト',
            messageType: data.messageType ?? 'user',
            createdAt: data.createdAt,
            clientId: (data as ChatMessagePayload & { clientId?: string }).clientId,
          },
        ];
      });
      return;
    }
    const data = message.data as PlaybackMessage;
    if (!data?.type) return;
    applyingRemoteRef.current = true;
    try {
      if (data.type === 'changeVideo' && data.videoId) {
        setVideoId(data.videoId);
        const pubId = data.publisherClientId ?? '';
        lastChangeVideoPublisherRef.current = pubId;
        setCurrentSongPosterClientId(pubId);
        const nextId = participatingOrderRef.current.length === 0 ? '' : (() => {
          const order = participatingOrderRef.current;
          const i = order.findIndex((p) => p.clientId === pubId);
          const nextIndex = i < 0 ? 0 : (i + 1) % order.length;
          return order[nextIndex]?.clientId ?? '';
        })();
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
        playerRef.current?.seekTo(data.currentTime);
        playerRef.current?.playVideo();
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

  /** 曲投入後に自動再生し、全員に play(currentTime: 0) を配信する */
  const scheduleAutoPlayAfterChangeVideo = useCallback(() => {
    if (autoPlayAfterChangeVideoRef.current) {
      clearTimeout(autoPlayAfterChangeVideoRef.current);
      autoPlayAfterChangeVideoRef.current = null;
    }
    autoPlayAfterChangeVideoRef.current = setTimeout(() => {
      autoPlayAfterChangeVideoRef.current = null;
      applyingRemoteRef.current = true;
      try {
        playerRef.current?.seekTo(0);
        playerRef.current?.playVideo();
        setCurrentTime(0);
        setPlaying(true);
        safePublish('play', { type: 'play', currentTime: 0 } as PlaybackMessage);
      } finally {
        setTimeout(() => {
          applyingRemoteRef.current = false;
        }, 300);
      }
    }, AUTO_PLAY_AFTER_CHANGE_VIDEO_MS);
  }, [safePublish]);

  useEffect(() => {
    return () => {
      if (autoPlayAfterChangeVideoRef.current) {
        clearTimeout(autoPlayAfterChangeVideoRef.current);
      }
    };
  }, []);

  /** 曲を貼った後にターンを次の人に進める */
  const advanceTurnAfterPost = useCallback(() => {
    const nextId = getNextTurnClientId(myClientId);
    setCurrentTurnClientId(nextId);
    publishRef.current?.(TURN_STATE_EVENT, { currentTurnClientId: nextId } as TurnStatePayload);
  }, [myClientId, getNextTurnClientId]);

  useEffect(() => {
    if (!roomId || ownerStatePublishRef.current) return;
    const pub = publishRef.current;
    if (!pub) return;
    const apply = (next: OwnerStatePayload) => {
      setOwnerState({ ownerClientId: next.ownerClientId, ownerLeftAt: next.ownerLeftAt });
      setOwnerStateToStorage(roomId, next);
    };
    if (participants.length === 0) return;
    const now = Date.now();
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
      if (ownerLeftAt === null) {
        const next = { ownerClientId, ownerLeftAt: now };
        apply(next);
        ownerStatePublishRef.current = true;
        pub(OWNER_STATE_EVENT, next as OwnerStatePayload);
        setTimeout(() => {
          ownerStatePublishRef.current = false;
        }, 500);
      } else if (now - ownerLeftAt >= OWNER_ABSENCE_MS) {
        const next = { ownerClientId: oldestParticipantClientId, ownerLeftAt: null };
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
  }, [roomId, participants, oldestParticipantClientId, ownerClientId, ownerLeftAt]);

  const nextPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePlayerStateChange = useCallback(
    (state: 'play' | 'pause' | 'ended', time: number) => {
      if (applyingRemoteRef.current) return;
      setCurrentTime(time);
      setPlaying(state === 'play');
      if (state === 'play') {
        safePublish('play', {
          type: 'play',
          currentTime: time,
        } as PlaybackMessage);
      }
      // pause は同期しない（誰かが止めても他メンバーは止めない。広告の有無で終了時刻がずれるため）
    },
    [safePublish]
  );

  const addAiMessage = useCallback(
    (body: string, options?: { allowWhenAiStopped?: boolean }) => {
      if (aiFreeSpeechStopped && !options?.allowWhenAiStopped) return;
      const id = createMessageId();
      const payload: ChatMessagePayload = {
        id,
        body,
        displayName: AI_DISPLAY_NAME,
        messageType: 'ai',
        createdAt: new Date().toISOString(),
      };
      safePublish(CHAT_MESSAGE_EVENT, payload);
      setMessages((prev) => [
        ...prev,
        {
          id: payload.id,
          body: payload.body,
          displayName: payload.displayName,
          messageType: payload.messageType,
          createdAt: payload.createdAt,
        },
      ]);
    },
    [safePublish, aiFreeSpeechStopped]
  );

  const addSystemMessage = useCallback((body: string, searchQuery?: string) => {
    const msg: ChatMessage = {
      id: createMessageId(),
      body,
      displayName: 'システム',
      messageType: 'system',
      createdAt: new Date().toISOString(),
      ...(searchQuery && { searchQuery }),
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  const previousParticipantsRef = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const currentMap = new Map(participants.map((p) => [p.clientId, p.displayName]));
    if (previousParticipantsRef.current === null) {
      previousParticipantsRef.current = currentMap;
      return;
    }
    const prev = previousParticipantsRef.current;
    const currentIds = new Set(currentMap.keys());
    prev.forEach((displayName, clientId) => {
      if (!currentIds.has(clientId)) {
        addAiMessage(`${displayName}さんが退出しました`, { allowWhenAiStopped: true });
      }
    });
    previousParticipantsRef.current = currentMap;
  }, [participants, addAiMessage]);

  useEffect(() => {
    if (initialGreetingDoneRef.current || messages.length > 0) return;
    initialGreetingDoneRef.current = true;
    let greeting: string;
    let isWelcomeBack = false;
    try {
      // 同一ルームの退室記録だけ参照（他ルームでは「おかえりなさい」にしない）
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
          greeting = `${effectiveDisplayName}さん、${getTimeBasedGreeting()}`;
        }
      } else {
        greeting = `${effectiveDisplayName}さん、${getTimeBasedGreeting()}`;
      }
    } catch {
      greeting = `${effectiveDisplayName}さん、${getTimeBasedGreeting()}`;
    }
    addAiMessage(greeting, { allowWhenAiStopped: true });
    if (!isWelcomeBack) addAiMessage(AI_FIRST_VOICE, { allowWhenAiStopped: true });
    addAiMessage(TURN_ORDER_VOICE, { allowWhenAiStopped: true });
    if (participatingOrder.length > 0) {
      const first = participatingOrder[0];
      setCurrentTurnClientId(first.clientId);
      publishRef.current?.(TURN_STATE_EVENT, { currentTurnClientId: first.clientId } as TurnStatePayload);
      addAiMessage(`${first.displayName}さん、曲を貼ってください`, { allowWhenAiStopped: true });
    } else {
      addAiMessage('どなたでもどうぞ貼ってください', { allowWhenAiStopped: true });
    }
    touchActivity();
  }, [messages.length, effectiveDisplayName, roomId, participatingOrder, addAiMessage, touchActivity]);

  const ZERO_SONG_PROMPT_INTERVAL_MS = 3 * 60 * 1000; // 3分に1回（複数人ルーム向け）
  useEffect(() => {
    if (videoId) {
      if (zeroSongPromptTimeoutRef.current) {
        clearTimeout(zeroSongPromptTimeoutRef.current);
        zeroSongPromptTimeoutRef.current = null;
      }
      return;
    }
    // 参加者が1人だけのときは入室時の「どなたでも…」のみとし、定期的な催促は出さない
    if (participants.length <= 1) {
      if (zeroSongPromptTimeoutRef.current) {
        clearTimeout(zeroSongPromptTimeoutRef.current);
        zeroSongPromptTimeoutRef.current = null;
      }
      return;
    }
    const schedule = () => {
      zeroSongPromptTimeoutRef.current = setTimeout(() => {
        zeroSongPromptTimeoutRef.current = null;
        if (videoIdRef.current) return;
        if (participantsCountForPromptRef.current <= 1) return;
        addAiMessage('どなたでもどうぞ貼ってください', { allowWhenAiStopped: true });
        schedule();
      }, ZERO_SONG_PROMPT_INTERVAL_MS);
    };
    schedule();
    return () => {
      if (zeroSongPromptTimeoutRef.current) {
        clearTimeout(zeroSongPromptTimeoutRef.current);
      }
    };
  }, [videoId, addAiMessage, participants.length]);

  useEffect(() => {
    const t = setInterval(() => {
      // comment-pack 由来の自由コメントを小出しにしている間は、一般豆知識は出さない
      if (suppressTidbitRef.current) return;
      if (!hasUserSentMessageRef.current && !videoIdRef.current) return;
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
              addAiMessage(prefix + data.text);
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
  }, [touchActivity, addAiMessage, userStatus]);

  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(CHAT_TEXT_COLOR_STORAGE_KEY) : null;
      if (saved && /^#[0-9a-fA-F]{6}$/.test(saved)) setUserTextColor(saved);
    } catch {}
  }, []);

  const SEC_AFTER_END_BEFORE_PROMPT = 30;
  const DEFAULT_DURATION_WHEN_UNKNOWN_SEC = 240;
  const FIVE_MIN_MS = 5 * 60 * 1000;
  /** comment-pack で生成した自由コメントを小出しにするためのタイマー群 */
  const freeCommentTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** comment-pack 由来の自由コメントが残っている間は tidbit（一般豆知識）を停止するフラグ */
  const suppressTidbitRef = useRef(false);

  /** 視聴専用をスキップしつつ、次の選曲者に促す。曲終了・5分経過時は投稿者のクライアントのみ実行 */
  const promptNextTurn = useCallback((options?: { fiveMinElapsed?: boolean }) => {
    if (myClientId !== lastChangeVideoPublisherRef.current) return;
    const fiveMinElapsed = options?.fiveMinElapsed === true;
    let cur = currentTurnClientIdRef.current;
    const order = participatingOrderRef.current;
    const orderLength = order.length;
    const participantsMap = new Map(participants.map((p) => [p.clientId, p]));
    while (cur) {
      const p = participantsMap.get(cur);
      if (p?.participatesInSelection !== false) break;
      const displayName = order.find((o) => o.clientId === cur)?.displayName ?? cur;
      addAiMessage(`${displayName}さんは視聴専用です（選曲する場合はマイページで切り替えてください）`, {
        allowWhenAiStopped: true,
      });
      const i = order.findIndex((o) => o.clientId === cur);
      const nextIndex = order.length === 0 ? 0 : (i < 0 ? 0 : i + 1) % order.length;
      cur = order[nextIndex]?.clientId ?? '';
      setCurrentTurnClientId(cur);
      publishRef.current?.(TURN_STATE_EVENT, { currentTurnClientId: cur } as TurnStatePayload);
    }
    // 参加者が1人だけのときは、5分経過メッセージは出さない
    if (fiveMinElapsed && orderLength <= 1) {
      return;
    }

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
  }, [participants, addAiMessage, myClientId]);

  useEffect(() => {
    nextPromptShownForVideoIdRef.current = null;
    lastEndedVideoIdForTidbitRef.current = null;
    if (!videoId) setCurrentSongPosterClientId('');
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
  }, [videoId]);

  const fetchAnnounceAndPublish = useCallback(
    (vid: string) => {
      fetch('/api/ai/announce-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: vid, displayName: effectiveDisplayName }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          // 音楽以外のコンテンツと判定された場合は、注意メッセージのみ出して曲としては扱わない
          if (data?.nonMusic) {
            addSystemMessage(
              'このルームでは洋楽の曲・MV・ライブ映像など音楽コンテンツのみ投稿をお願いしています。アニメ本編やゲーム実況、切り抜き配信などは控えていただけると助かります。',
            );
            touchActivity();
            return;
          }
          if (data?.text) {
            addAiMessage(data.text, { allowWhenAiStopped: true });
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
              nextPromptShownForVideoIdRef.current = vid;
              promptNextTurn({ fiveMinElapsed: true });
            }, FIVE_MIN_MS);
          }
        })
        .catch(() => {});
    },
    [addAiMessage, touchActivity, effectiveDisplayName, promptNextTurn]
  );

  const fetchCommentaryAndPublish = useCallback(
    (vid: string) => {
      // まず comment-pack を試し、基本コメント＋自由コメント3本をまとめて取得して小出しにする
      fetch('/api/ai/comment-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: vid }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((pack) => {
          if (pack?.baseComment) {
            commentPackVideoIdRef.current = vid;
            const packPrefix = pack?.source === 'library' ? '[DB] ' : '[NEW] ';
            // 基本コメントをすぐ表示（2回目以降は蓄積DBから＝[DB]）
            addAiMessage(packPrefix + pack.baseComment);
            touchActivity();
            tidbitPreferMainArtistLeftRef.current = 2;

            // 既存の自由コメントタイマーをクリア
            if (freeCommentTimeoutsRef.current.length > 0) {
              freeCommentTimeoutsRef.current.forEach((t) => clearTimeout(t));
              freeCommentTimeoutsRef.current = [];
            }

            // 自由コメントを1分おきに小出し
            const comments: string[] = (
              Array.isArray(pack.freeComments)
                ? pack.freeComments.filter((c: unknown) => typeof c === 'string' && c.trim())
                : []
            ).slice(0, COMMENT_PACK_MAX_FREE_COMMENTS);
            // 自由コメントが残っている間は tidbit を抑止（曲が変わるまで維持し、4本目の豆知識が割り込まないようにする）
            suppressTidbitRef.current = comments.length > 0;
            comments.forEach((c, index) => {
              const delayMs = (index + 1) * 60 * 1000; // 1分ごと
              const timer = setTimeout(() => {
                // まだ同じ曲が再生中のときだけ表示
                if (videoIdRef.current !== vid) return;
                addAiMessage(packPrefix + c);
                touchActivity();
              }, delayMs);
              freeCommentTimeoutsRef.current.push(timer);
            });
          } else {
            // パック取得に失敗した場合は従来の commentary API にフォールバック
            return fetch('/api/ai/commentary', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ videoId: vid }),
            })
              .then((r) => (r.ok ? r.json() : null))
              .then((data) => {
                if (data?.text) {
                  const prefix = data.source === 'library' ? '[DB] ' : '[NEW] ';
                  addAiMessage(prefix + data.text);
                  touchActivity();
                  tidbitPreferMainArtistLeftRef.current = 2;
                } else {
                  addSystemMessage('曲解説を取得できませんでした。しばらくしてから再度お試しください。');
                }
              });
          }
          return null;
        })
        .catch(() => {
          addSystemMessage('曲解説を取得できませんでした。しばらくしてから再度お試しください。');
        });
    },
    [addAiMessage, addSystemMessage, touchActivity]
  );

  const schedulePlaybackHistory = useCallback(
    (rid: string, vid: string) => {
      if (playbackHistoryTimeoutRef.current) clearTimeout(playbackHistoryTimeoutRef.current);
      if (!rid) return;
      playbackHistoryTimeoutRef.current = setTimeout(() => {
        playbackHistoryTimeoutRef.current = null;
        if (videoIdRef.current !== vid) return;
        fetch('/api/room-playback-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: rid,
            videoId: vid,
            displayName: effectiveDisplayName,
            isGuest,
          }),
        })
          .then((r) => r.json())
          .then((data) => { if (data?.ok && data?.skipped !== 'duplicate') setPlaybackHistoryRefreshKey((k) => k + 1); })
          .catch(() => {});
      }, 10000);
    },
    [effectiveDisplayName, isGuest]
  );

  useEffect(() => {
    return () => {
      if (playbackHistoryTimeoutRef.current) clearTimeout(playbackHistoryTimeoutRef.current);
    };
  }, []);

  const saveSongHistory = useCallback(
    (videoIdToSave: string) => {
      if (isGuest) return;
      fetch('/api/song-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: videoIdToSave, roomId: roomId ?? '' }),
      }).catch(() => {});
    },
    [isGuest, roomId]
  );

  const handleVideoUrlFromChat = useCallback(
    (url: string) => {
      const id = extractVideoId(url);
      if (!id) return;

      // 他の人の曲が再生中のときに、順番外の参加者が検索結果から上書き再生しないように制御
      const currentVid = videoIdRef.current;
      const turnClientId = currentTurnClientIdRef.current;
      const order = participatingOrderRef.current;
      const multipleParticipants = order.length > 1;
      const isMyTurn = turnClientId && turnClientId === myClientId;

      if (currentVid && multipleParticipants && !isMyTurn && !isOwner) {
        const turnParticipant =
          order.find((p) => p.clientId === turnClientId) ?? null;
        const nameLabel = turnParticipant?.displayName ?? '次の方';
        addSystemMessage(
          `今は${nameLabel}さんの選曲ターンです。曲を変える場合は順番が回ってきてから検索・再生してください。`
        );
        return;
      }

      setVideoId(id);
      lastChangeVideoPublisherRef.current = myClientId;
      setCurrentSongPosterClientId(myClientId);
      safePublish('changeVideo', {
        type: 'changeVideo',
        videoId: id,
        publisherClientId: myClientId,
      } as PlaybackMessage);
      playerRef.current?.loadVideoById(id);
      scheduleAutoPlayAfterChangeVideo();
      advanceTurnAfterPost();
      fetchAnnounceAndPublish(id);
      fetchCommentaryAndPublish(id);
      saveSongHistory(id);
      schedulePlaybackHistory(roomId ?? '', id);
    },
    [
      safePublish,
      scheduleAutoPlayAfterChangeVideo,
      advanceTurnAfterPost,
      fetchAnnounceAndPublish,
      fetchCommentaryAndPublish,
      saveSongHistory,
      roomId,
      schedulePlaybackHistory,
      myClientId,
      isOwner,
      addSystemMessage,
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
      addSystemMessage('候補リストに追加しました。マイターンのときに「候補リスト」から選んで貼れます。');
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
    (text: string) => {
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

      if (messages.length === 0) {
        const greeting = `${effectiveDisplayName}さん、${getTimeBasedGreeting()}`;
        addAiMessage(greeting, { allowWhenAiStopped: true });
        addAiMessage(AI_FIRST_VOICE, { allowWhenAiStopped: true });
        touchActivity();
        return;
      }

      /* 「〇〇さん < おかえり」の歓迎には「おかえりなさい！」だけ返す（API呼び出しなし） */
      if (/さん\s*<\s*おかえり/.test(text.trim())) {
        addAiMessage('おかえりなさい！');
        touchActivity();
        return;
      }

      /* 離席・ROMの意思表明時はAPIを呼ばない。「〇〇さん、いってらっしゃいませ」はチャネル受信側で全員に出す */
      if (isLeaveOrRomPhrase(text)) {
        touchActivity();
        return;
      }

      const doChatReply = () => {
        const listForAi = [...messages, newUserMsg].map((m) => ({
          displayName: m.displayName,
          body: m.body,
          messageType: m.messageType,
        }));
        const aiErrorMessage =
          'AI が応答できませんでした。.env.local に GEMINI_API_KEY を設定し、開発サーバーを再起動してください。';
        fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: listForAi,
            videoId: videoId ?? undefined,
            roomId: roomId ?? undefined,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.text) {
              addAiMessage(data.text);
              touchActivity();
            } else addSystemMessage(aiErrorMessage);
          })
          .catch(() => addSystemMessage(aiErrorMessage));
      };

      if (pendingSongQueryRef.current && isShortConfirmation(text)) {
        const query = pendingSongQueryRef.current;
        const confirmationText = pendingSongConfirmationTextRef.current;
        pendingSongQueryRef.current = null;
        pendingSongConfirmationTextRef.current = null;
        fetch('/api/ai/paste-by-query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        })
          .then((r2) => (r2.ok ? r2.json() : null))
          .then((data2) => {
            if (data2?.ok && data2?.videoId && data2?.artistTitle) {
              setVideoId(data2.videoId);
              lastChangeVideoPublisherRef.current = myClientId;
              setCurrentSongPosterClientId(myClientId);
              safePublish('changeVideo', { type: 'changeVideo', videoId: data2.videoId, publisherClientId: myClientId } as PlaybackMessage);
              playerRef.current?.loadVideoById(data2.videoId);
              scheduleAutoPlayAfterChangeVideo();
              advanceTurnAfterPost();
              addAiMessage(`${data2.artistTitle} を貼りました！`);
              saveSongHistory(data2.videoId);
              touchActivity();
              fetchAnnounceAndPublish(data2.videoId);
              fetchCommentaryAndPublish(data2.videoId);
              schedulePlaybackHistory(roomId ?? '', data2.videoId);
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

      fetch('/api/ai/resolve-song-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: text,
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
            pendingSongQueryRef.current = data.query;
            pendingSongConfirmationTextRef.current = data.confirmationText;
            addAiMessage(
              `${data.confirmationText} ですね？曲を再生するには、入力欄のまま「検索」ボタンを押して一覧から動画を選んでください。（送信だけでは再生されません）`,
            );
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
      saveSongHistory,
      roomId,
      schedulePlaybackHistory,
      myClientId,
      scheduleAutoPlayAfterChangeVideo,
      advanceTurnAfterPost,
      fetchAnnounceAndPublish,
      fetchCommentaryAndPublish,
    ]
  );

  return (
    <main className="flex h-screen flex-col bg-gray-950 p-3">
      <header className="mb-2 flex items-center justify-between border-b border-gray-800 pb-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-lg font-semibold text-white">
            洋楽AIチャット{roomId ? ` - ${roomId}` : ''}
          </h1>
          <p className="text-xs text-gray-400 whitespace-nowrap">
            AIのコメントは事実と異なる場合があります。また参加者のご意見やご質問に対して肯定的に答える傾向があります。あくまで参考情報としてお楽しみいただき、内容の正確性はご自身でもご確認ください。
          </p>
        </div>
        {onLeave && (
          <span className="flex items-center gap-2">
            {!isGuest && (
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
            )}
            <button
              type="button"
              onClick={onLeave}
              className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 hover:text-white"
              aria-label="ルームを退室して最初の画面に戻る"
            >
              退室する
            </button>
          </span>
        )}
      </header>

      <section className="mb-2">
        <UserBar
          displayName={effectiveDisplayName}
          isGuest={isGuest}
          onMyPageClick={() => setMyPageOpen(true)}
          participants={participants}
          myClientId={myClientId}
          currentOwnerClientId={ownerLeftAt === null ? ownerClientId : ''}
          currentTurnClientId={currentTurnClientId}
          currentSongPosterClientId={currentSongPosterClientId}
          onForceExit={
            isOwner
              ? (targetClientId, targetDisplayName) => {
                  safePublish(OWNER_FORCE_EXIT_EVENT, {
                    targetClientId,
                    targetDisplayName,
                  } as OwnerForceExitPayload);
                }
              : undefined
          }
          onTransferOwner={
            isOwner
              ? (newOwnerClientId) => {
                  const next = { ownerClientId: newOwnerClientId, ownerLeftAt: null };
                  setOwnerState(next);
                  if (roomId) setOwnerStateToStorage(roomId, next);
                  safePublish(OWNER_STATE_EVENT, next as OwnerStatePayload);
                }
              : undefined
          }
          aiFreeSpeechStopped={aiFreeSpeechStopped}
          onAiFreeSpeechStopToggle={
            isOwner
              ? () => {
                  const next = !aiFreeSpeechStopped;
                  setAiFreeSpeechStopped(next);
                  safePublish(OWNER_AI_FREE_SPEECH_STOP_EVENT, {
                    enabled: next,
                  } as OwnerAiFreeSpeechStopPayload);
                }
              : undefined
          }
          onParticipantClick={(displayName) => chatInputRef.current?.insertText(`${displayName}さん < `)}
        />
      </section>

      {myPageOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="マイページ"
          onClick={() => setMyPageOpen(false)}
        >
          <div className="max-h-full max-w-md overflow-auto" onClick={(e) => e.stopPropagation()}>
            <MyPage
              onClose={() => setMyPageOpen(false)}
              currentUserTextColor={userTextColor}
              onUserTextColorChange={(color) => {
                setUserTextColor(color);
                try {
                  localStorage.setItem(CHAT_TEXT_COLOR_STORAGE_KEY, color);
                } catch {}
              }}
              chatOwnerTransferParticipants={isOwner ? participants.filter((p) => p.clientId !== myClientId) : undefined}
              currentOwnerClientId={ownerClientId}
              myClientId={myClientId}
              isChatOwner={isOwner}
              onTransferOwner={
                isOwner
                  ? (newOwnerClientId) => {
                      const next = { ownerClientId: newOwnerClientId, ownerLeftAt: null };
                      setOwnerState(next);
                      if (roomId) setOwnerStateToStorage(roomId, next);
                      safePublish(OWNER_STATE_EVENT, next as OwnerStatePayload);
                      setMyPageOpen(false);
                    }
                  : undefined
              }
              isGuest={isGuest}
              guestDisplayName={effectiveDisplayName}
              onGuestDisplayNameChange={isGuest ? setGuestDisplayName : undefined}
              participatesInSelection={participatesInSelection}
              onParticipatesInSelectionChange={setParticipatesInSelection}
              userStatus={userStatus}
              onUserStatusChange={setUserStatus}
              songLimit5MinEnabled={songLimit5MinEnabled}
              onSongLimit5MinToggle={
                isOwner
                  ? () => {
                      const next = !songLimit5MinEnabled;
                      setSongLimit5MinEnabled(next);
                      safePublish(OWNER_5MIN_LIMIT_EVENT, { enabled: next } as Owner5MinLimitPayload);
                    }
                  : undefined
              }
            />
          </div>
        </div>
      )}

      <ResizableSection
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
            currentVideoId={videoId}
            refreshKey={playbackHistoryRefreshKey}
            isGuest={isGuest}
            favoritedVideoIds={favoritedVideoIds}
            onFavoriteClick={handleFavoriteClick}
          />
        }
      />

      <section className="mt-2">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <ChatInput
              ref={chatInputRef}
              onSendMessage={handleSendMessage}
              onVideoUrl={handleVideoUrlFromChat}
              onSystemMessage={addSystemMessage}
              onAddCandidate={handleAddCandidateFromSearch}
              onPreviewStart={handlePreviewStart}
              onPreviewStop={handlePreviewStop}
            />
          </div>
          <button
            type="button"
            className={`mt-2 h-[38px] flex-shrink-0 rounded border border-emerald-600 bg-emerald-900/40 px-3 text-xs font-semibold text-emerald-100 hover:bg-emerald-800/70 ${
              candidateButtonFlash ? 'animate-pulse ring-2 ring-emerald-300' : ''
            }`}
            onClick={() => setCandidateOpen(true)}
          >
            候補リスト
            {candidateSongs.length > 0 && (
              <span className="ml-1 inline-block rounded bg-emerald-700 px-1 text-[10px]">
                {candidateSongs.length}
              </span>
            )}
          </button>
        </div>
      </section>

      {candidateOpen && (
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
                    .sort((a, b) => a.addedAt - b.addedAt)
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
