'use client';

import Image from 'next/image';
import { EnvelopeIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useRef, useState } from 'react';
import Chat from '@/components/chat/Chat';
import ChatInput from '@/components/chat/ChatInput';
import YouTubePlayer, {
  type YouTubePlayerHandle,
} from '@/components/player/YouTubePlayer';
import { GuestRegisterPromptModal } from '@/components/auth/GuestRegisterPromptModal';
import MyPage from '@/components/mypage/MyPage';
import NowPlaying from '@/components/room/NowPlaying';
import RoomMainLayout from '@/components/room/RoomMainLayout';
import RoomPlaybackHistory from '@/components/room/RoomPlaybackHistory';
import { SiteFeedbackModal } from '@/components/room/SiteFeedbackModal';
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
import {
  SYSTEM_MESSAGE_COMMENTARY_FETCH_FAILED,
  SYSTEM_MESSAGE_JP_NO_COMMENTARY,
} from '@/lib/chat-system-copy';
import { resolveAiQuestionMusicRelated } from '@/lib/client-ai-question-guard-resolve';
import { isDevMinimalSongAi } from '@/lib/dev-minimal-song-ai';
import { playbackLog } from '@/lib/playback-debug';
import { extractVideoId, isStandaloneNonYouTubeUrl } from '@/lib/youtube';
import type { ChatMessage, SystemMessageOptions } from '@/types/chat';
import { useIsLgViewport } from '@/hooks/useLgViewport';
import { useRoomChatLogPersistence } from '@/hooks/useRoomChatLogPersistence';
import { useSupabaseAuthUserId } from '@/hooks/useSupabaseAuthUserId';
import { isAiQuestionGuardKickExemptUserId } from '@/lib/ai-question-guard-exempt-user-ids';
import { incrementAiQuestionWarnCount, setKicked, setKickedSitewide } from '@/lib/room-owner';

const AI_DISPLAY_NAME = 'AI';
const SILENCE_TIDBIT_SEC = 30;

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
const TIDBIT_COOLDOWN_SEC = 60;

function createMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

/**
 * Ably キー未設定時用。同期なし・ローカル再生のみ。チャットはこのタブ内のみ。
 */
interface RoomWithoutSyncProps {
  displayName?: string;
  roomId?: string;
  roomTitle?: string;
  roomDisplayTitle?: string;
  isGuest?: boolean;
  onLeave?: () => void;
}

export default function RoomWithoutSync({
  displayName: displayNameProp = 'ゲスト',
  roomId,
  roomTitle = '',
  roomDisplayTitle = '',
  isGuest = false,
  onLeave,
}: RoomWithoutSyncProps) {
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const [roomDisplayTitleCurrent, setRoomDisplayTitleCurrent] = useState(roomDisplayTitle);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  useRoomChatLogPersistence(roomId, messages, { isGuest, myClientId: '' });
  const [myPageOpen, setMyPageOpen] = useState(false);
  const [guestRegisterModalOpen, setGuestRegisterModalOpen] = useState(false);
  const [siteFeedbackOpen, setSiteFeedbackOpen] = useState(false);
  const [playbackHistoryModalOpen, setPlaybackHistoryModalOpen] = useState(false);
  const [chatSummaryModalOpen, setChatSummaryModalOpen] = useState(false);
  const [chatSummaryLoading, setChatSummaryLoading] = useState(false);
  const [chatSummaryError, setChatSummaryError] = useState<string | null>(null);
  useEffect(() => {
    setRoomDisplayTitleCurrent(roomDisplayTitle);
  }, [roomDisplayTitle]);
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
  const authUserId = useSupabaseAuthUserId(isGuest);
  const [userTextColor, setUserTextColor] = useState(DEFAULT_CHAT_TEXT_COLOR);
  const lastActivityAtRef = useRef(Date.now());
  const lastTidbitAtRef = useRef(0);
  const videoIdRef = useRef<string | null>(null);
  const hasUserSentMessageRef = useRef(false);
  const pendingSongQueryRef = useRef<string | null>(null);
  const pendingSongConfirmationTextRef = useRef<string | null>(null);
  const nextPromptShownForVideoIdRef = useRef<string | null>(null);
  const initialGreetingDoneRef = useRef(false);
  const lastSendAtRef = useRef(0);
  const sendTimestampsRef = useRef<number[]>([]);
  const playbackHistoryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPlayPollRef = useRef<number | null>(null);
  const [playbackHistoryRefreshKey, setPlaybackHistoryRefreshKey] = useState(0);
  const [skipUsedForVideoId, setSkipUsedForVideoId] = useState<string | null>(null);
  const [yellowCards, setYellowCards] = useState(0);
  const [favoritedVideoIds, setFavoritedVideoIds] = useState<string[]>([]);
  const recentlyUsedTidbitIdsRef = useRef<string[]>([]);
  const tidbitCountSinceUserMessageRef = useRef(0);
  const lastEndedVideoIdForTidbitRef = useRef<string | null>(null);
  const tidbitPreferMainArtistLeftRef = useRef(0);
  /** （邦楽）選曲後〜次の曲まで AI 発言停止 */
  const jpDomesticSilenceVideoIdRef = useRef<string | null>(null);
  /** 開発簡略モードで comment-pack 基本を出した動画。豆知識を当該曲中は抑止 */
  const commentPackVideoIdRef = useRef<string | null>(null);
  videoIdRef.current = videoId;

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
      await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: videoIdTrim,
          displayName: displayNameProp,
          playedAt: new Date().toISOString(),
        }),
      });
      fetchFavoritedIds();
    },
    [isGuest, fetchFavoritedIds, displayNameProp]
  );

  const openChatSummaryModal = useCallback(() => {
    if (!roomId) return;
    setChatSummaryModalOpen(true);
    setChatSummaryLoading(true);
    setChatSummaryError(null);
    fetch(`/api/room-session-summary?roomId=${encodeURIComponent(roomId)}`)
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

  const nextPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePlayerStateChange = useCallback((state: 'play' | 'pause' | 'ended', _time: number) => {
    setPlaying(state === 'play');
  }, []);

  const handleSkipCurrentTrack = useCallback(() => {
    const vid = videoIdRef.current;
    if (!vid) return;
    setSkipUsedForVideoId(vid);
    try {
      playerRef.current?.pauseVideo();
    } catch {
      // noop
    }
    setVideoId(null);
    setPlaying(false);
    addAiMessage('次の曲をどうぞ', { bypassJpDomesticSilence: true });
  }, []);

  const addAiMessage = useCallback(
    (
      body: string,
      options?: {
        bypassJpDomesticSilence?: boolean;
      }
    ) => {
      const jpS = jpDomesticSilenceVideoIdRef.current;
      const cur = videoIdRef.current;
      if (
        jpS != null &&
        cur != null &&
        jpS === cur &&
        !options?.bypassJpDomesticSilence
      ) {
        return;
      }
      const msg: ChatMessage = {
        id: createMessageId(),
        body,
        displayName: AI_DISPLAY_NAME,
        messageType: 'ai',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, msg]);
    },
    []
  );

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

  useEffect(() => {
    if (initialGreetingDoneRef.current || messages.length > 0) return;
    initialGreetingDoneRef.current = true;
    let greeting: string;
    let isWelcomeBack = false;
    try {
      // 同一部屋の退室記録だけ参照（他部屋では「おかえりなさい」にしない）
      const key = roomId ? getLastExitStorageKey(roomId) : null;
      const raw = key && typeof window !== 'undefined' ? sessionStorage.getItem(key) : null;
      if (raw) {
        const data = JSON.parse(raw) as { timestamp?: number; displayName?: string };
        const sameUser = data.displayName === displayNameProp && typeof data.timestamp === 'number';
        const awayMs = sameUser && typeof data.timestamp === 'number' ? Date.now() - data.timestamp : 0;
        const minAwayMs = 1 * 1000;
        const maxAwayMs = 6 * 60 * 60 * 1000;
        if (sameUser && awayMs >= minAwayMs && awayMs <= maxAwayMs) {
          greeting = `${displayNameProp}さん、おかえりなさい！`;
          isWelcomeBack = true;
          sessionStorage.removeItem(key!);
        } else {
          greeting = `${displayNameProp}さん、${getTimeBasedGreeting()}`;
        }
      } else {
        greeting = `${displayNameProp}さん、${getTimeBasedGreeting()}`;
      }
    } catch {
      greeting = `${displayNameProp}さん、${getTimeBasedGreeting()}`;
    }
    addAiMessage(greeting);
    if (!isWelcomeBack) addAiMessage(AI_FIRST_VOICE);
    touchActivity();
  }, [messages.length, displayNameProp, roomId, addAiMessage, touchActivity]);

  useEffect(() => {
    const t = setInterval(() => {
      if (!hasUserSentMessageRef.current && !videoIdRef.current) return;
      const jpS = jpDomesticSilenceVideoIdRef.current;
      const vNow = videoIdRef.current;
      if (jpS != null && vNow != null && jpS === vNow) return;
      if (isDevMinimalSongAi()) {
        const packed = commentPackVideoIdRef.current;
        if (packed != null && packed === vNow) return;
      }
      const now = Date.now();
      if (
        now - lastActivityAtRef.current >= SILENCE_TIDBIT_SEC * 1000 &&
        now - lastTidbitAtRef.current >= TIDBIT_COOLDOWN_SEC * 1000
      ) {
        const preferGeneral = tidbitCountSinceUserMessageRef.current >= 3;
        // 無言時の「洋楽全般」豆知識はオフ（曲に紐づく豆知識のみ）
        if (preferGeneral) return;
        lastTidbitAtRef.current = now;
        touchActivity();
        const recentIds = recentlyUsedTidbitIdsRef.current.slice(-20);
        const preferMainArtist = tidbitPreferMainArtistLeftRef.current > 0;
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
  }, [touchActivity, addAiMessage]);

  const videoEndedAtRef = useRef<number | null>(null);
  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(CHAT_TEXT_COLOR_STORAGE_KEY) : null;
      if (saved && /^#[0-9a-fA-F]{6}$/.test(saved)) setUserTextColor(saved);
    } catch {}
  }, []);

  const SEC_AFTER_END_BEFORE_PROMPT = 30;
  const DEFAULT_DURATION_WHEN_UNKNOWN_SEC = 240;

  useEffect(() => {
    nextPromptShownForVideoIdRef.current = null;
    lastEndedVideoIdForTidbitRef.current = null;
    commentPackVideoIdRef.current = null;
    setSkipUsedForVideoId(null);
    if (!videoId) {
      jpDomesticSilenceVideoIdRef.current = null;
    }
    if (nextPromptTimeoutRef.current) {
      clearTimeout(nextPromptTimeoutRef.current);
      nextPromptTimeoutRef.current = null;
    }
  }, [videoId]);

  const fetchAnnounceAndPublish = useCallback(
    (vid: string, options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      fetch('/api/ai/announce-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: vid, displayName: displayNameProp, roomId }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!silent && data?.text) {
            const jpDomestic = data?.japaneseDomestic === true;
            const jpSilence =
              typeof data?.jpDomesticSilence === 'boolean' ? data.jpDomesticSilence : jpDomestic;
            if (jpSilence) {
              jpDomesticSilenceVideoIdRef.current = vid;
            }
            addAiMessage(data.text, { bypassJpDomesticSilence: true });
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
            addAiMessage('次の曲をどうぞ');
          }, delayMs);
        })
        .catch(() => {});
    },
    [addAiMessage, touchActivity, displayNameProp]
  );

  const fetchCommentaryAndPublish = useCallback(
    (vid: string) => {
      if (isDevMinimalSongAi()) {
        fetch('/api/ai/comment-pack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId: vid, roomId }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((pack) => {
            if (pack?.skipAiCommentary) {
              commentPackVideoIdRef.current = null;
              const isJpSilenceVideo =
                jpDomesticSilenceVideoIdRef.current != null &&
                jpDomesticSilenceVideoIdRef.current === vid;
              if (!isJpSilenceVideo) {
                addSystemMessage(SYSTEM_MESSAGE_JP_NO_COMMENTARY);
              }
              return;
            }
            if (pack?.baseComment) {
              commentPackVideoIdRef.current = vid;
              const packPrefix = pack?.source === 'library' ? '[DB] ' : '[NEW] ';
              addAiMessage(packPrefix + pack.baseComment);
              touchActivity();
              tidbitPreferMainArtistLeftRef.current = 2;
              return;
            }
            commentPackVideoIdRef.current = null;
            addSystemMessage(SYSTEM_MESSAGE_COMMENTARY_FETCH_FAILED);
          })
          .catch(() => {
            commentPackVideoIdRef.current = null;
            addSystemMessage(SYSTEM_MESSAGE_COMMENTARY_FETCH_FAILED);
          });
        return;
      }
      fetch('/api/ai/commentary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: vid }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.skipAiCommentary) {
            const isJpSilenceVideo =
              jpDomesticSilenceVideoIdRef.current != null &&
              jpDomesticSilenceVideoIdRef.current === vid;
            if (!isJpSilenceVideo) {
              addSystemMessage(SYSTEM_MESSAGE_JP_NO_COMMENTARY);
            }
            return;
          }
          if (data?.text) {
            const prefix = data.source === 'library' ? '[DB] ' : '[NEW] ';
            addAiMessage(prefix + data.text);
            touchActivity();
            tidbitPreferMainArtistLeftRef.current = 2;
          } else addSystemMessage(SYSTEM_MESSAGE_COMMENTARY_FETCH_FAILED);
        })
        .catch(() => {
          addSystemMessage(SYSTEM_MESSAGE_COMMENTARY_FETCH_FAILED);
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
            displayName: displayNameProp,
            isGuest,
            selectionRound: 1,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data?.ok && !data?.skipped) setPlaybackHistoryRefreshKey((k) => k + 1);
          })
          .catch(() => {});
      }, 10000);
    },
    [displayNameProp, isGuest]
  );

  /**
   * 視聴履歴の INSERT は投稿者側クライアントが10秒後に実行する。
   * 同室の他クライアントでも一覧が揃うよう、少し遅れて全員が再取得する。
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
      if (autoPlayPollRef.current != null) {
        window.clearInterval(autoPlayPollRef.current);
        autoPlayPollRef.current = null;
      }
    };
  }, []);

  /** モバイル等で遅延した playVideo がユーザー操作コンテキスト外になり再生されないのを防ぐ */
  const scheduleLocalAutoPlayAfterLoad = useCallback(() => {
    if (autoPlayPollRef.current != null) {
      window.clearInterval(autoPlayPollRef.current);
      autoPlayPollRef.current = null;
    }
    const pollMs = 50;
    const giveUpMs = 8000;
    const startedAt = Date.now();
    let intervalId: number | null = null;
    const stop = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      autoPlayPollRef.current = null;
    };
    const tryOnce = (): boolean => {
      const handle = playerRef.current;
      if (!handle) {
        if (Date.now() - startedAt >= giveUpMs) {
          playbackLog('localAutoPlay: give up (no handle)');
          stop();
          return true;
        }
        return false;
      }
      if (handle.getPlayerState?.() === null) {
        if (Date.now() - startedAt >= giveUpMs) {
          playbackLog('localAutoPlay: give up (YT never ready)');
          stop();
          return true;
        }
        playbackLog('localAutoPlay: wait YT.Player');
        return false;
      }
      playbackLog('localAutoPlay: seekTo + playVideo');
      handle.seekTo(0);
      handle.playVideo();
      setPlaying(true);
      stop();
      return true;
    };
    if (!tryOnce()) {
      intervalId = window.setInterval(() => tryOnce(), pollMs);
      autoPlayPollRef.current = intervalId;
    }
  }, []);

  const saveSongHistory = useCallback(
    (videoIdToSave: string) => {
      if (isGuest) return;
      fetch('/api/song-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: videoIdToSave,
          roomId: roomId ?? '',
          selectionRound: 1,
        }),
      }).catch(() => {});
    },
    [isGuest, roomId]
  );

  const handleVideoUrlFromChat = useCallback(
    (url: string) => {
      const id = extractVideoId(url);
      if (!id) return;
      const prevId = videoIdRef.current;
      const sameReplay = Boolean(prevId && prevId === id);
      jpDomesticSilenceVideoIdRef.current = null;
      setVideoId(id);
      playerRef.current?.loadVideoById(id);
      scheduleLocalAutoPlayAfterLoad();
      fetchAnnounceAndPublish(
        id,
        (sameReplay || isDevMinimalSongAi()) ? { silent: true } : undefined,
      );
      if (!sameReplay) fetchCommentaryAndPublish(id);
      saveSongHistory(id);
      schedulePlaybackHistory(roomId ?? '', id);
    },
    [
      fetchAnnounceAndPublish,
      fetchCommentaryAndPublish,
      saveSongHistory,
      roomId,
      schedulePlaybackHistory,
      scheduleLocalAutoPlayAfterLoad,
    ]
  );

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

      const userMsg: ChatMessage = {
        id: createMessageId(),
        body: text,
        displayName: displayNameProp,
        messageType: 'user',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      hasUserSentMessageRef.current = true;
      tidbitCountSinceUserMessageRef.current = 0;
      lastEndedVideoIdForTidbitRef.current = null;
      touchActivity();
      updateSendTimestamps(lastSendAtRef, sendTimestampsRef);

      const jpUiBlocked =
        jpDomesticSilenceVideoIdRef.current != null &&
        jpDomesticSilenceVideoIdRef.current === videoIdRef.current;

      if (messages.length === 0) {
        if (!jpUiBlocked) {
          const greeting = `${displayNameProp}さん、${getTimeBasedGreeting()}`;
          addAiMessage(greeting);
          addAiMessage(AI_FIRST_VOICE);
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
      const aiMentioned = trimmed.startsWith('@');
      const aiPromptText = aiMentioned ? trimmed.replace(/^@\s*/, '').trim() : '';
      if (aiMentioned && aiPromptText) {
        const recentForGuard = [
          ...messages.map((m) => ({
            displayName: m.displayName,
            body: m.body,
            messageType: m.messageType ?? 'user',
          })),
          {
            displayName: displayNameProp,
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
          const warningCount = incrementAiQuestionWarnCount(roomId || 'local', 'local-client');
          const nextCards = warningCount <= 1 ? 0 : Math.min(3, warningCount - 1);
          setYellowCards(nextCards);
          const kickExempt = !isGuest && isAiQuestionGuardKickExemptUserId(authUserId);
          const message =
            warningCount === 1
              ? `システム警告: ${displayNameProp}さんの質問は音楽に関係ない内容と判断しました。次回からお気をつけください。`
              : warningCount === 2
                ? `システム警告: ${displayNameProp}さんにイエローカード1枚を付与しました（AI質問は音楽関連のみ）。`
                : warningCount === 3
                  ? `システム警告: ${displayNameProp}さんにイエローカード2枚目を付与しました。次のカードで退場となります。`
                  : kickExempt
                    ? `システム警告: ${displayNameProp}さんの「@」質問に関する警告が継続しています。管理者アカウントのため、退場および入室禁止は行いません。`
                    : `システム警告: ${displayNameProp}さんに3枚目のカードを付与したため、強制退場と一定期間の入室禁止を実行しました。`;
          const action: 'warn' | 'yellow' | 'ban' =
            warningCount >= 4 ? 'ban' : warningCount === 1 ? 'warn' : 'yellow';
          addSystemMessage(message, {
            systemKind: 'ai_question_guard',
            aiGuardMeta: {
              targetClientId: 'local-client',
              warningCount,
              yellowCards: nextCards,
              action,
            },
          });
          if (warningCount >= 4 && onLeave && !kickExempt) {
            setKicked(roomId || 'local', 'local-client');
            setKickedSitewide();
            onLeave();
          }
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
        const listForAi = [...messages, { ...userMsg, body: aiPromptText || userMsg.body }].map((m) => ({
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
              addAiMessage(data.text);
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
              const vid = data2.videoId;
              const prevId = videoIdRef.current;
              const sameReplay = Boolean(prevId && prevId === vid);
              jpDomesticSilenceVideoIdRef.current = null;
              setVideoId(vid);
              playerRef.current?.loadVideoById(vid);
              scheduleLocalAutoPlayAfterLoad();
              addAiMessage(`${data2.artistTitle} を貼りました！`);
              saveSongHistory(vid);
              touchActivity();
              fetchAnnounceAndPublish(
                vid,
                (sameReplay || isDevMinimalSongAi()) ? { silent: true } : undefined,
              );
              if (!sameReplay) fetchCommentaryAndPublish(vid);
              schedulePlaybackHistory(roomId ?? '', vid);
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
      messages,
      videoId,
      addAiMessage,
      addSystemMessage,
      touchActivity,
      saveSongHistory,
      roomId,
      schedulePlaybackHistory,
      fetchAnnounceAndPublish,
      fetchCommentaryAndPublish,
      scheduleLocalAutoPlayAfterLoad,
      isGuest,
      displayNameProp,
      authUserId,
    ]
  );

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-gray-950 p-3">
      <div className="mb-2 shrink-0 rounded border border-amber-700 bg-amber-900/50 px-3 py-2 text-sm leading-snug text-amber-200">
        .env.local に <strong>NEXT_PUBLIC_ABLY_API_KEY</strong> を設定すると、複数ブラウザ・タブが「同じ部屋の別々の参加者」として扱われ、参加者一覧・同期再生・チャット共有が利用できます。未設定の場合は各ウィンドウが独立して動作します。
      </div>
      <header className="mb-2 flex shrink-0 flex-row items-center justify-between gap-3 border-b border-gray-800 pb-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Image
            src="/music_ai_chat_wh.png"
            alt=""
            width={180}
            height={36}
            className="h-9 w-auto max-h-9 shrink-0 object-contain object-left"
            priority
          />
          <h1 className="hidden min-w-0 flex-1 truncate text-lg font-semibold text-white sm:block">
            {`部屋 ${roomId || '--'}${(roomDisplayTitleCurrent || roomTitle) ? ` - ${roomDisplayTitleCurrent || roomTitle}` : ''}`}
          </h1>
        </div>
        {onLeave && (
          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setSiteFeedbackOpen(true)}
              className="inline-flex items-center gap-1 text-sm text-gray-300 underline decoration-dotted underline-offset-2 hover:text-white"
              title="このサイトへのご意見"
            >
              <EnvelopeIcon className="h-4 w-4 shrink-0" aria-hidden />
              ご意見
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 hover:text-white"
              aria-label="部屋を退室して最初の画面に戻る"
            >
              退室する
            </button>
          </div>
        )}
      </header>

      <section className="mb-1 shrink-0">
        <UserBar
          displayName={displayNameProp}
          isGuest={isGuest}
          onGuestRegisterClick={isGuest ? () => setGuestRegisterModalOpen(true) : undefined}
          onMyPageClick={!isGuest ? () => setMyPageOpen(true) : undefined}
          onPlaybackHistoryClick={isLg ? undefined : () => setPlaybackHistoryModalOpen(true)}
          currentVideoId={videoId}
          favoritedVideoIds={favoritedVideoIds}
          onFavoriteCurrentClick={handleFavoriteCurrentClick}
          skipCurrentTrackActive={Boolean(videoId && skipUsedForVideoId !== videoId)}
          skipCurrentTrackDisabled={false}
          onSkipCurrentTrack={handleSkipCurrentTrack}
          participants={[{ clientId: 'local-client', displayName: displayNameProp, textColor: userTextColor, yellowCards }]}
          myClientId="local-client"
        />
      </section>

      <SiteFeedbackModal
        open={siteFeedbackOpen}
        onClose={() => setSiteFeedbackOpen(false)}
        roomId={roomId}
        displayName={displayNameProp}
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
              onRoomProfileSaved={({ displayTitle }) => setRoomDisplayTitleCurrent(displayTitle)}
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

      <RoomMainLayout
        left={
          <Chat
            messages={messages}
            currentUserDisplayName={displayNameProp}
            userTextColor={userTextColor}
            currentVideoId={videoId}
            onChatSummaryClick={roomId ? openChatSummaryModal : undefined}
            roomId={roomId ?? 'local'}
            myClientId="local-client"
          />
        }
        rightTop={
          <>
            <YouTubePlayer
              ref={playerRef}
              videoId={videoId}
              onStateChange={handlePlayerStateChange}
            />
            <NowPlaying />
          </>
        }
        rightBottom={
          <RoomPlaybackHistory
            roomId={roomId}
            currentVideoId={videoId}
            refreshKey={playbackHistoryRefreshKey}
            participantsWithColor={[{ displayName: displayNameProp, textColor: userTextColor }]}
            isGuest={isGuest}
            favoritedVideoIds={favoritedVideoIds}
            onFavoriteClick={handleFavoriteClick}
          />
        }
        playbackHistoryModalOpen={playbackHistoryModalOpen}
        onPlaybackHistoryModalClose={() => setPlaybackHistoryModalOpen(false)}
      />

      <section className="mt-2 shrink-0">
        <ChatInput
          onSendMessage={handleSendMessage}
          onVideoUrl={handleVideoUrlFromChat}
          isGuest={isGuest}
          onSystemMessage={addSystemMessage}
          onPreviewStart={handlePreviewStart}
          onPreviewStop={handlePreviewStop}
        />
      </section>
    </main>
  );
}
