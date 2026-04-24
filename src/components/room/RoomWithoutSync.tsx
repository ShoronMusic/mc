'use client';

import Image from 'next/image';
import { EnvelopeIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useRef, useState } from 'react';
import Chat from '@/components/chat/Chat';
import ChatInput, { type ChatInputHandle } from '@/components/chat/ChatInput';
import YouTubePlayer, {
  type YouTubePlayerHandle,
} from '@/components/player/YouTubePlayer';
import { useResumeYoutubeWhenTabVisible } from '@/hooks/useResumeYoutubeWhenTabVisible';
import { GuestRegisterPromptModal } from '@/components/auth/GuestRegisterPromptModal';
import MyPage from '@/components/mypage/MyPage';
import NowPlaying from '@/components/room/NowPlaying';
import RoomMainLayout from '@/components/room/RoomMainLayout';
import RoomPlaybackHistory from '@/components/room/RoomPlaybackHistory';
import ChatSummaryModalBody, {
  buildActiveUsageTimeLabelFromFetch,
  type RoomSessionChatSummaryDisplay,
} from '@/components/room/ChatSummaryModalBody';
import { useThemePlaylistRoomSubmitMission } from '@/hooks/useThemePlaylistRoomSubmitMission';
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
  buildAiQuestionGuardSoftDeclineMessage,
  shouldShowJpNoCommentarySystemMessage,
} from '@/lib/chat-system-copy';
import type { SongQuizPayload } from '@/lib/song-quiz-types';
import { getSongQuizRevealDelayMs } from '@/lib/song-quiz-result-announcement';
import { shouldShortCircuitSongRequestForAtPrompt } from '@/lib/ai-question-about-detail-heuristic';
import { resolveAiQuestionMusicRelated } from '@/lib/client-ai-question-guard-resolve';
import { isDevMinimalSongAi } from '@/lib/dev-minimal-song-ai';
import { formatMusic8ModeratorIntroPrefix } from '@/lib/music8-moderator-chat-prefix';
import {
  buildCommentaryUiLabel,
  NEXT_RECOMMEND_PENDING_UI_LABEL,
  SONG_QUIZ_UI_LABEL,
} from '@/lib/chat-message-ui-labels';
import { USER_SONG_HISTORY_UPDATED_EVENT } from '@/lib/user-song-history-events';
import { playbackLog } from '@/lib/playback-debug';
import { rememberRoomForGuideReturn } from '@/lib/safe-return-path';
import { extractVideoId, isStandaloneNonYouTubeUrl } from '@/lib/youtube';
import { isYoutubeKeywordSearchEnabled } from '@/lib/youtube-keyword-search-ui';
import { scheduleNextSongRecommendAfterCommentary } from '@/lib/schedule-next-song-recommend-client';
import { scheduleThemePlaylistRoomBlurbAfterPack } from '@/lib/schedule-theme-playlist-room-blurb';
import type { ChatMessage, SystemMessageOptions } from '@/types/chat';
import { useIsLgViewport } from '@/hooks/useLgViewport';
import { useRoomChatLogPersistence } from '@/hooks/useRoomChatLogPersistence';
import { useRoomAccessLogReport } from '@/hooks/useRoomAccessLogReport';
import { createClient } from '@/lib/supabase/client';
import {
  clearAiQuestionWarnStorage,
  clearKickedStorageForRoom,
  clearKickedSitewideStorage,
} from '@/lib/room-owner';
import { lineFromJoinGreetingApi } from '@/lib/join-greeting-logic';
import {
  markLeaveSiteFeedbackAnswered,
  markLeaveSiteFeedbackShown,
  shouldShowLeaveSiteFeedbackPrompt,
} from '@/lib/site-feedback-prompt';

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
  const chatInputRef = useRef<ChatInputHandle>(null);
  const [roomDisplayTitleCurrent, setRoomDisplayTitleCurrent] = useState(roomDisplayTitle);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  useRoomChatLogPersistence(roomId, messages, { isGuest, myClientId: '' });
  useRoomAccessLogReport(roomId, {
    isGuest,
    displayName: displayNameProp.trim() || 'ゲスト',
  });
  useEffect(() => {
    rememberRoomForGuideReturn(roomId);
  }, [roomId]);
  const [myPageOpen, setMyPageOpen] = useState(false);
  const themePlaylistRoomSubmit = useThemePlaylistRoomSubmitMission(isGuest, myPageOpen);
  const [guestRegisterModalOpen, setGuestRegisterModalOpen] = useState(false);
  const [siteFeedbackOpen, setSiteFeedbackOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [leaveFeedbackPending, setLeaveFeedbackPending] = useState(false);
  const [playbackHistoryModalOpen, setPlaybackHistoryModalOpen] = useState(false);
  const [chatSummaryModalOpen, setChatSummaryModalOpen] = useState(false);
  const [chatSummaryLoading, setChatSummaryLoading] = useState(false);
  const [chatSummaryError, setChatSummaryError] = useState<string | null>(null);
  const headerRoomId = roomId || '--';
  const headerRoomSub = (roomDisplayTitleCurrent || roomTitle || '').trim();
  const handleLeaveClick = useCallback(() => {
    if (!onLeave) return;
    if (shouldShowLeaveSiteFeedbackPrompt()) {
      markLeaveSiteFeedbackShown();
      setLeaveFeedbackPending(true);
      setSiteFeedbackOpen(true);
      return;
    }
    onLeave();
  }, [onLeave]);
  const handleCloseSiteFeedback = useCallback(() => {
    setSiteFeedbackOpen(false);
    if (leaveFeedbackPending) {
      setLeaveFeedbackPending(false);
      onLeave?.();
    }
  }, [leaveFeedbackPending, onLeave]);
  const handleOpenSiteFeedbackFromHeader = useCallback(() => {
    setLeaveFeedbackPending(false);
    setSiteFeedbackOpen(true);
  }, []);
  const handleInviteFriends = useCallback(() => {
    setInviteModalOpen(true);
  }, []);
  const inviteRoomUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  const inviteDateTime =
    typeof window !== 'undefined'
      ? new Date().toLocaleString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
  const inviteSubject = '洋楽AIチャットにご招待';
  const inviteBody = `洋楽AIチャットにご招待します\nこの部屋でチャットしています（${inviteDateTime}）\n${inviteRoomUrl}`;
  const inviteGmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(inviteSubject)}&body=${encodeURIComponent(inviteBody)}`;
  const inviteOutlookUrl = `https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(inviteSubject)}&body=${encodeURIComponent(inviteBody)}`;
  const inviteLineUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(inviteRoomUrl)}`;
  useEffect(() => {
    setRoomDisplayTitleCurrent(roomDisplayTitle);
  }, [roomDisplayTitle]);

  const [chatStyleAdminTools, setChatStyleAdminTools] = useState(false);
  /** AI_TIDBIT_MODERATOR_USER_IDS（tidbit NG・チューニング報告ボタン） */
  const [canRejectTidbit, setCanRejectTidbit] = useState(false);
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
      authSub?.subscription.unsubscribe();
    };
  }, [isGuest]);

  const [chatSummary, setChatSummary] = useState<RoomSessionChatSummaryDisplay | null>(null);
  const isLg = useIsLgViewport();
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
  const songQuizFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextSongRecommendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const themePlaylistBlurbTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingThemePlaylistBlurbRef = useRef<{
    videoId: string;
    themeId: string;
    themeLabel?: string;
  } | null>(null);
  const userRoomAiCommentaryEnabledRef = useRef(true);
  const userRoomAiSongQuizEnabledRef = useRef(true);
  const userRoomAiRecommendEnabledRef = useRef(true);
  type SongQuizRoundMetaLocal = { correctIndex: number; choices: string[]; videoId: string };
  type SongQuizAnswerRow = { clientId: string; displayName: string; pickedIndex: number };
  const songQuizLocalRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const songQuizLocalMetaByIdRef = useRef<Map<string, SongQuizRoundMetaLocal>>(new Map());
  const songQuizLocalAnswersByIdRef = useRef<Map<string, SongQuizAnswerRow[]>>(new Map());
  videoIdRef.current = videoId;
  playingRef.current = playing;
  useResumeYoutubeWhenTabVisible(playerRef, videoIdRef, playingRef);

  useEffect(() => {
    if (isGuest) {
      userRoomAiCommentaryEnabledRef.current = true;
      userRoomAiSongQuizEnabledRef.current = true;
      userRoomAiRecommendEnabledRef.current = true;
      return;
    }
    let cancelled = false;
    void fetch('/api/user/room-ai-features', { credentials: 'include' })
      .then(async (r) => {
        const d = (await r.json().catch(() => null)) as {
          commentaryEnabled?: unknown;
          songQuizEnabled?: unknown;
          nextSongRecommendEnabled?: unknown;
          error?: unknown;
        } | null;
        if (cancelled) return;
        if (!r.ok || !d || typeof d !== 'object' || typeof d.error === 'string') {
          userRoomAiCommentaryEnabledRef.current = true;
          userRoomAiSongQuizEnabledRef.current = true;
          userRoomAiRecommendEnabledRef.current = true;
          return;
        }
        userRoomAiCommentaryEnabledRef.current = d.commentaryEnabled !== false;
        userRoomAiSongQuizEnabledRef.current = d.songQuizEnabled !== false;
        userRoomAiRecommendEnabledRef.current = d.nextSongRecommendEnabled !== false;
      })
      .catch(() => {
        if (!cancelled) {
          userRoomAiCommentaryEnabledRef.current = true;
          userRoomAiSongQuizEnabledRef.current = true;
          userRoomAiRecommendEnabledRef.current = true;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isGuest, myPageOpen]);

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

  const handleNextSongRecommendReject = useCallback(
    async (messageId: string, recommendationId: string) => {
      try {
        const res = await fetch('/api/ai/reject-next-song-recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ recommendationId }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          alert(typeof data?.error === 'string' ? data.error : 'おすすめ削除に失敗しました');
          return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } catch {
        alert('おすすめ削除に失敗しました');
      }
    },
    [],
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
          sessionWindowLabel: data.sessionWindowLabel ?? '',
          activeUsageTimeLabel: buildActiveUsageTimeLabelFromFetch(data as Record<string, unknown>),
          participantSongCounts: Array.isArray(data.participantSongCounts) ? data.participantSongCounts : [],
          eraDistribution: Array.isArray(data.eraDistribution) ? data.eraDistribution : [],
          styleDistribution: Array.isArray(data.styleDistribution) ? data.styleDistribution : [],
          popularArtists: Array.isArray(data.popularArtists) ? data.popularArtists : [],
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

  const addAiMessage = useCallback(
    (
      body: string,
      options?: {
        bypassJpDomesticSilence?: boolean;
        videoId?: string | null;
        aiSource?: ChatMessage['aiSource'];
        recommendationId?: string | null;
        deferToPanel?: boolean;
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
        ...(options?.videoId != null ? { videoId: options.videoId } : {}),
        ...(options?.aiSource ? { aiSource: options.aiSource } : {}),
        ...(options?.recommendationId ? { recommendationId: options.recommendationId } : {}),
        ...(options?.deferToPanel ? { deferToPanel: true as const } : {}),
      };
      setMessages((prev) => [...prev, msg]);
    },
    []
  );

  const buildNextSongRecommendExtras = useCallback(
    (targetVideoId: string): Record<string, unknown> => {
      if (nextPromptShownForVideoIdRef.current !== targetVideoId) return {};
      return { deferToPanel: true };
    },
    [],
  );

  const createPendingNextSongRecommendCard = useCallback((targetVideoId: string): string => {
    const id = createMessageId();
    const deferToPanel = nextPromptShownForVideoIdRef.current === targetVideoId;
    setMessages((prev) => [
      ...prev,
      {
        id,
        body: `${NEXT_RECOMMEND_PENDING_UI_LABEL}次に聴くなら候補を生成中です…`,
        displayName: AI_DISPLAY_NAME,
        messageType: 'ai',
        createdAt: new Date().toISOString(),
        videoId: targetVideoId,
        aiSource: 'next_song_recommend',
        nextSongRecommendPending: true,
        ...(deferToPanel ? { deferToPanel: true } : {}),
      },
    ]);
    return id;
  }, []);

  const clearPendingNextSongRecommendCard = useCallback((messageId: string): void => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  const scheduleLocalSongQuizReveal = useCallback((quizMessageId: string, q: SongQuizPayload, vid: string) => {
    if (songQuizLocalRevealTimerRef.current) {
      clearTimeout(songQuizLocalRevealTimerRef.current);
      songQuizLocalRevealTimerRef.current = null;
    }
    songQuizLocalMetaByIdRef.current.set(quizMessageId, {
      correctIndex: q.correctIndex,
      choices: q.choices,
      videoId: vid,
    });
    songQuizLocalAnswersByIdRef.current.set(quizMessageId, []);
    const revealDelay = getSongQuizRevealDelayMs();
    songQuizLocalRevealTimerRef.current = setTimeout(() => {
      songQuizLocalRevealTimerRef.current = null;
      if (!songQuizLocalMetaByIdRef.current.get(quizMessageId)) return;
      songQuizLocalMetaByIdRef.current.delete(quizMessageId);
      songQuizLocalAnswersByIdRef.current.delete(quizMessageId);
    }, revealDelay);
  }, []);

  const handleSongQuizPick = useCallback((quizMessageId: string, _vid: string, pickedIndex: number) => {
    const list = songQuizLocalAnswersByIdRef.current.get(quizMessageId) ?? [];
    const filtered = list.filter((x) => x.clientId !== 'local-client');
    filtered.push({
      clientId: 'local-client',
      displayName: displayNameProp.trim() || 'ゲスト',
      pickedIndex,
    });
    songQuizLocalAnswersByIdRef.current.set(quizMessageId, filtered);
  }, [displayNameProp]);

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
  }, [addAiMessage]);

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
    const rid = roomId || 'local';
    clearAiQuestionWarnStorage(rid);
    clearKickedStorageForRoom(rid);
    clearKickedSitewideStorage();
    setYellowCards(0);
    addSystemMessage(
      'この端末に保存されていた「@」質問の警告カウントと退場・入室制限の記録を消しました。',
    );
  }, [roomId, addSystemMessage]);

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
          const sameUser = data.displayName === displayNameProp && typeof data.timestamp === 'number';
          const awayMs = sameUser && typeof data.timestamp === 'number' ? Date.now() - data.timestamp : 0;
          const minAwayMs = 1 * 1000;
          const maxAwayMs = 6 * 60 * 60 * 1000;
          if (sameUser && awayMs >= minAwayMs && awayMs <= maxAwayMs) {
            greeting = `${displayNameProp}さん、おかえりなさい！`;
            isWelcomeBack = true;
            sessionStorage.removeItem(key!);
          } else {
            greeting = `${displayNameProp}さん、${timeGreeting}`;
          }
        } else {
          greeting = `${displayNameProp}さん、${timeGreeting}`;
        }
      } catch {
        greeting = `${displayNameProp}さん、${timeGreeting}`;
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
          const line = lineFromJoinGreetingApi(displayNameProp, timeGreeting, d);
          if (line) greeting = line;
        } catch {
          /* 時間帯挨拶のまま */
        }
      }

      if (cancelled) return;
      addAiMessage(greeting);
      if (!isWelcomeBack) addAiMessage(AI_FIRST_VOICE);
      touchActivity();
    })();

    return () => {
      cancelled = true;
    };
  }, [messages.length, displayNameProp, roomId, addAiMessage, touchActivity, isGuest]);

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
  }, [touchActivity, addAiMessage, roomId]);

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
    if (songQuizFetchTimeoutRef.current) {
      clearTimeout(songQuizFetchTimeoutRef.current);
      songQuizFetchTimeoutRef.current = null;
    }
    if (themePlaylistBlurbTimeoutRef.current) {
      clearTimeout(themePlaylistBlurbTimeoutRef.current);
      themePlaylistBlurbTimeoutRef.current = null;
    }
    pendingThemePlaylistBlurbRef.current = null;
    if (songQuizLocalRevealTimerRef.current) {
      clearTimeout(songQuizLocalRevealTimerRef.current);
      songQuizLocalRevealTimerRef.current = null;
    }
    songQuizLocalMetaByIdRef.current.clear();
    songQuizLocalAnswersByIdRef.current.clear();
  }, [videoId]);

  const fetchAnnounceAndPublish = useCallback(
    (vid: string, options?: { silent?: boolean; themePlaylistThemeLabel?: string | null }) => {
      const silent = options?.silent === true;
      const themeLabelRaw =
        typeof options?.themePlaylistThemeLabel === 'string'
          ? options.themePlaylistThemeLabel.trim()
          : '';
      const themeLabelFromPending =
        pendingThemePlaylistBlurbRef.current?.videoId === vid
          ? (pendingThemePlaylistBlurbRef.current?.themeLabel ?? '').trim()
          : '';
      const themePlaylistThemeLabel = themeLabelRaw || themeLabelFromPending;
      fetch('/api/ai/announce-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: vid,
          displayName: displayNameProp,
          roomId,
          ...(themePlaylistThemeLabel ? { themePlaylistThemeLabel } : {}),
        }),
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
            addAiMessage(data.text, { bypassJpDomesticSilence: true, videoId: vid });
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
    [addAiMessage, touchActivity, displayNameProp, roomId]
  );

  const fetchCommentaryAndPublish = useCallback(
    (vid: string) => {
      if (!userRoomAiCommentaryEnabledRef.current) {
        pendingThemePlaylistBlurbRef.current = null;
        if (songQuizFetchTimeoutRef.current) {
          clearTimeout(songQuizFetchTimeoutRef.current);
          songQuizFetchTimeoutRef.current = null;
        }
        if (nextSongRecommendTimeoutRef.current) {
          clearTimeout(nextSongRecommendTimeoutRef.current);
          nextSongRecommendTimeoutRef.current = null;
        }
        if (themePlaylistBlurbTimeoutRef.current) {
          clearTimeout(themePlaylistBlurbTimeoutRef.current);
          themePlaylistBlurbTimeoutRef.current = null;
        }
        return;
      }
      if (isDevMinimalSongAi()) {
        fetch('/api/ai/comment-pack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: vid,
            roomId,
            recentMessages: messages.slice(-18).map((m) => ({
              displayName: m.displayName,
              body: typeof m.body === 'string' ? m.body : '',
              messageType: m.messageType ?? 'user',
            })),
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((pack) => {
            const skipQuizRecommendForTheme =
              pendingThemePlaylistBlurbRef.current?.videoId === vid &&
              Boolean(pendingThemePlaylistBlurbRef.current?.themeId);
            if (pack?.skipAiCommentary) {
              pendingThemePlaylistBlurbRef.current = null;
              commentPackVideoIdRef.current = null;
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
              return;
            }
            if (pack?.baseComment) {
              commentPackVideoIdRef.current = vid;
              const packPrefix = pack?.source === 'library' ? '[DB] ' : '[NEW] ';
              const modIntro = formatMusic8ModeratorIntroPrefix(
                canRejectTidbit,
                pack.music8ModeratorHints,
              );
              addAiMessage(`${buildCommentaryUiLabel('01')} ${packPrefix + modIntro + pack.baseComment}`, { videoId: vid });
              touchActivity();
              const commentaryCtx =
                typeof pack.baseComment === 'string' ? pack.baseComment.trim() : '';
              const skipQuizRecommendIntroOnly = Boolean(pack.songIntroOnlyDiscography);
              const shouldGateRecommendByQuiz =
                commentaryCtx.length >= 60 &&
                userRoomAiSongQuizEnabledRef.current &&
                !skipQuizRecommendIntroOnly;
              if (shouldGateRecommendByQuiz && !skipQuizRecommendForTheme) {
                if (songQuizFetchTimeoutRef.current) clearTimeout(songQuizFetchTimeoutRef.current);
                songQuizFetchTimeoutRef.current = setTimeout(() => {
                  songQuizFetchTimeoutRef.current = null;
                  if (videoIdRef.current !== vid) return;
                  if (userRoomAiRecommendEnabledRef.current) {
                    scheduleNextSongRecommendAfterCommentary({
                      videoId: vid,
                      roomId,
                      songQuizDelayMs: 0,
                      preferFastAfterQuiz: true,
                      isGuest,
                      videoIdRef,
                      registerTimer: (t) => {
                        if (nextSongRecommendTimeoutRef.current) {
                          clearTimeout(nextSongRecommendTimeoutRef.current);
                        }
                        nextSongRecommendTimeoutRef.current = t;
                      },
                      addAiMessage,
                      buildAddAiMessageExtras: () => buildNextSongRecommendExtras(vid),
                      allowAfterVideoChange: true,
                        createPendingCard: () => createPendingNextSongRecommendCard(vid),
                        clearPendingCard: clearPendingNextSongRecommendCard,
                    });
                  }
                  void fetch('/api/ai/song-quiz', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      videoId: vid,
                      roomId,
                      commentaryContext: commentaryCtx,
                    }),
                  })
                    .then((r) => (r.ok ? r.json() : null))
                    .then((res) => {
                      if (videoIdRef.current !== vid || !res?.quiz) return;
                      const q = res.quiz as SongQuizPayload;
                      const id = createMessageId();
                      setMessages((prev) => [
                        ...prev,
                        {
                          id,
                          body: `${SONG_QUIZ_UI_LABEL} 三択クイズ（曲解説の内容のみを根拠に自動生成）`,
                          displayName: '曲クイズ',
                          messageType: 'system',
                          createdAt: new Date().toISOString(),
                          videoId: vid,
                          systemKind: 'song_quiz',
                          songQuiz: q,
                        },
                      ]);
                      scheduleLocalSongQuizReveal(id, q, vid);
                    });
                }, 3500);
              }
              tidbitPreferMainArtistLeftRef.current = 2;
              if (
                userRoomAiRecommendEnabledRef.current &&
                !shouldGateRecommendByQuiz &&
                !skipQuizRecommendForTheme &&
                !skipQuizRecommendIntroOnly
              ) {
                scheduleNextSongRecommendAfterCommentary({
                  videoId: vid,
                  roomId,
                  songQuizDelayMs: 3500,
                  isGuest,
                  videoIdRef,
                  registerTimer: (t) => {
                    if (nextSongRecommendTimeoutRef.current) {
                      clearTimeout(nextSongRecommendTimeoutRef.current);
                    }
                    nextSongRecommendTimeoutRef.current = t;
                  },
                  addAiMessage,
                  buildAddAiMessageExtras: () => buildNextSongRecommendExtras(vid),
                  allowAfterVideoChange: true,
                  createPendingCard: () => createPendingNextSongRecommendCard(vid),
                  clearPendingCard: clearPendingNextSongRecommendCard,
                });
              }
              scheduleThemePlaylistRoomBlurbAfterPack({
                videoId: vid,
                roomId,
                selectorDisplayName: displayNameProp,
                packEndDelayMs: 3500,
                commentaryContext: commentaryCtx,
                isGuest,
                pendingRef: pendingThemePlaylistBlurbRef,
                videoIdRef,
                registerTimer: (t) => {
                  if (themePlaylistBlurbTimeoutRef.current) {
                    clearTimeout(themePlaylistBlurbTimeoutRef.current);
                  }
                  themePlaylistBlurbTimeoutRef.current = t;
                },
                addAiMessage,
              });
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
          const skipQuizRecommendForTheme =
            pendingThemePlaylistBlurbRef.current?.videoId === vid &&
            Boolean(pendingThemePlaylistBlurbRef.current?.themeId);
          if (data?.skipAiCommentary) {
            pendingThemePlaylistBlurbRef.current = null;
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
            return;
          }
          if (data?.text) {
            const prefix = data.source === 'library' ? '[DB] ' : '[NEW] ';
            addAiMessage(`${buildCommentaryUiLabel('01')} ${prefix + data.text}`, { videoId: vid });
            touchActivity();
            const commentarySingle = `${prefix}${data.text}`.trim();
            const skipQuizRecommendIntroOnly = Boolean(data?.songIntroOnlyDiscography);
            const shouldGateRecommendByQuiz =
              commentarySingle.length >= 60 &&
              userRoomAiSongQuizEnabledRef.current &&
              !skipQuizRecommendIntroOnly;
            if (shouldGateRecommendByQuiz && !skipQuizRecommendForTheme) {
              if (songQuizFetchTimeoutRef.current) clearTimeout(songQuizFetchTimeoutRef.current);
              songQuizFetchTimeoutRef.current = setTimeout(() => {
                songQuizFetchTimeoutRef.current = null;
                if (videoIdRef.current !== vid) return;
                if (userRoomAiRecommendEnabledRef.current) {
                  scheduleNextSongRecommendAfterCommentary({
                    videoId: vid,
                    roomId,
                    songQuizDelayMs: 0,
                    preferFastAfterQuiz: true,
                    isGuest,
                    videoIdRef,
                    registerTimer: (t) => {
                      if (nextSongRecommendTimeoutRef.current) {
                        clearTimeout(nextSongRecommendTimeoutRef.current);
                      }
                      nextSongRecommendTimeoutRef.current = t;
                    },
                    addAiMessage,
                    buildAddAiMessageExtras: () => buildNextSongRecommendExtras(vid),
                    allowAfterVideoChange: true,
                      createPendingCard: () => createPendingNextSongRecommendCard(vid),
                      clearPendingCard: clearPendingNextSongRecommendCard,
                  });
                }
                void fetch('/api/ai/song-quiz', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    videoId: vid,
                    roomId,
                    commentaryContext: commentarySingle,
                  }),
                })
                  .then((r) => (r.ok ? r.json() : null))
                  .then((res) => {
                    if (videoIdRef.current !== vid || !res?.quiz) return;
                    const q = res.quiz as SongQuizPayload;
                    const id = createMessageId();
                    setMessages((prev) => [
                      ...prev,
                      {
                        id,
                        body: `${SONG_QUIZ_UI_LABEL} 三択クイズ（曲解説の内容のみを根拠に自動生成）`,
                        displayName: '曲クイズ',
                        messageType: 'system',
                        createdAt: new Date().toISOString(),
                        videoId: vid,
                        systemKind: 'song_quiz',
                        songQuiz: q,
                      },
                    ]);
                    scheduleLocalSongQuizReveal(id, q, vid);
                  });
              }, 4000);
            }
            tidbitPreferMainArtistLeftRef.current = 2;
            if (
              userRoomAiRecommendEnabledRef.current &&
              !shouldGateRecommendByQuiz &&
              !skipQuizRecommendForTheme &&
              !skipQuizRecommendIntroOnly
            ) {
              scheduleNextSongRecommendAfterCommentary({
                videoId: vid,
                roomId,
                songQuizDelayMs: 4000,
                isGuest,
                videoIdRef,
                registerTimer: (t) => {
                  if (nextSongRecommendTimeoutRef.current) {
                    clearTimeout(nextSongRecommendTimeoutRef.current);
                  }
                  nextSongRecommendTimeoutRef.current = t;
                },
                addAiMessage,
                buildAddAiMessageExtras: () => buildNextSongRecommendExtras(vid),
                allowAfterVideoChange: true,
                createPendingCard: () => createPendingNextSongRecommendCard(vid),
                clearPendingCard: clearPendingNextSongRecommendCard,
              });
            }
            scheduleThemePlaylistRoomBlurbAfterPack({
              videoId: vid,
              roomId,
              selectorDisplayName: displayNameProp,
              packEndDelayMs: 4000,
              commentaryContext: commentarySingle,
              isGuest,
              pendingRef: pendingThemePlaylistBlurbRef,
              videoIdRef,
              registerTimer: (t) => {
                if (themePlaylistBlurbTimeoutRef.current) {
                  clearTimeout(themePlaylistBlurbTimeoutRef.current);
                }
                themePlaylistBlurbTimeoutRef.current = t;
              },
              addAiMessage,
            });
          } else addSystemMessage(SYSTEM_MESSAGE_COMMENTARY_FETCH_FAILED);
        })
        .catch(() => {
          addSystemMessage(SYSTEM_MESSAGE_COMMENTARY_FETCH_FAILED);
        });
    },
    [
      addAiMessage,
      addSystemMessage,
      touchActivity,
      roomId,
      messages,
      canRejectTidbit,
      scheduleLocalSongQuizReveal,
      isGuest,
      displayNameProp,
      buildNextSongRecommendExtras,
      createPendingNextSongRecommendCard,
      clearPendingNextSongRecommendCard,
    ]
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
        credentials: 'include',
        body: JSON.stringify({
          videoId: videoIdToSave,
          roomId: roomId ?? '',
          selectionRound: 1,
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

  const handleVideoUrlFromChat = useCallback(
    (
      url: string,
      opts?: { themePlaylistThemeId?: string | null; themePlaylistThemeLabel?: string | null },
    ) => {
      const id = extractVideoId(url);
      if (!id) return;
      const themePick =
        typeof opts?.themePlaylistThemeId === 'string' ? opts.themePlaylistThemeId.trim() : '';
      const themeLabel =
        typeof opts?.themePlaylistThemeLabel === 'string' ? opts.themePlaylistThemeLabel.trim() : '';
      if (!isGuest && themePick) {
        pendingThemePlaylistBlurbRef.current = {
          videoId: id,
          themeId: themePick,
          ...(themeLabel ? { themeLabel } : {}),
        };
      } else {
        pendingThemePlaylistBlurbRef.current = null;
      }
      const prevId = videoIdRef.current;
      const sameReplay = Boolean(prevId && prevId === id);
      jpDomesticSilenceVideoIdRef.current = null;
      setVideoId(id);
      playerRef.current?.loadVideoById(id);
      scheduleLocalAutoPlayAfterLoad();
      fetchAnnounceAndPublish(
        id,
        {
          ...((sameReplay || isDevMinimalSongAi()) ? { silent: true } : {}),
          ...(themeLabel ? { themePlaylistThemeLabel: themeLabel } : {}),
        },
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
      isGuest,
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
      const aiMentioned = /^[@\uFF20]/.test(trimmed);
      const aiPromptText = aiMentioned ? trimmed.replace(/^[@\uFF20]\s*/, '').trim() : '';
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
          setYellowCards(0);
          const message = buildAiQuestionGuardSoftDeclineMessage(displayNameProp);
          addSystemMessage(message, {
            systemKind: 'ai_question_guard',
            aiGuardMeta: {
              targetClientId: 'local-client',
              warningCount: 1,
              yellowCards: 0,
              action: 'warn',
            },
          });
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
              const body = data.text.startsWith('【AI回答】') ? data.text : `【AI回答】 ${data.text}`;
              addAiMessage(body, { aiSource: 'chat_reply' });
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

      const recentForSongResolve = messages.slice(-6).map((m) => ({
        displayName: m.displayName,
        body: m.body,
        messageType: m.messageType ?? 'user',
      }));

      if (shouldShortCircuitSongRequestForAtPrompt(aiPromptText, recentForSongResolve)) {
        doChatReply();
        touchActivity();
        return;
      }

      fetch('/api/ai/resolve-song-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: aiPromptText,
          roomId: roomId ?? undefined,
          recentMessages: recentForSongResolve,
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.needConfirm && data?.confirmationText && data?.query) {
            if (!isYoutubeKeywordSearchEnabled()) {
              /** 検索オフ時は曲名確認フローを出せないので、そのまま @ チャット（/api/ai/chat）へ */
              doChatReply();
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
    ]
  );

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-gray-950 p-3">
      <div className="mb-2 shrink-0 rounded border border-amber-700 bg-amber-900/50 px-3 py-2 text-sm leading-snug text-amber-200">
        .env.local に <strong>NEXT_PUBLIC_ABLY_API_KEY</strong> を設定すると、複数ブラウザ・タブが「同じ部屋の別々の参加者」として扱われ、参加者一覧・同期再生・チャット共有が利用できます。未設定の場合は各ウィンドウが独立して動作します。
      </div>
      <header className="mb-2 flex shrink-0 flex-row items-center justify-between gap-2 border-b border-gray-800 pb-2 sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Image
            src="/music_ai_chat_wh.png"
            alt=""
            width={180}
            height={36}
            className="h-10 w-auto max-h-10 shrink-0 object-contain object-left"
            priority
          />
          <span className="inline-flex shrink-0 items-center rounded bg-lime-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-lime-200 sm:px-2 sm:text-[10px]">
            <span className="sm:hidden">β</span>
            <span className="hidden sm:inline">（β）版</span>
          </span>
          <h1
            className="min-w-0 flex-1 text-xs font-semibold leading-tight text-white sm:truncate sm:text-lg sm:leading-none"
            title={`部屋 ${headerRoomId}${headerRoomSub ? ` - ${headerRoomSub}` : ''}`}
          >
            <span className="inline-flex min-w-0 items-center gap-1">
              <span className="inline-flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded border border-sky-500/60 bg-sky-500/10 px-0 py-0 leading-none text-sky-200 sm:w-auto sm:px-1 sm:py-0.5">
                <span className="text-[8px] font-medium sm:text-[9px]">部屋</span>
                <span className="text-[11px] font-semibold sm:text-xs">{headerRoomId}</span>
              </span>
              <span className="min-w-0 truncate text-base font-semibold leading-none text-white">
                {headerRoomSub || ''}
              </span>
            </span>
          </h1>
        </div>
        {onLeave && (
          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleOpenSiteFeedbackFromHeader}
              className="inline-flex items-center gap-1 text-sm text-gray-300 underline decoration-dotted underline-offset-2 hover:text-white"
              title="このサイトへのご意見"
              aria-label="このサイトへのご意見"
            >
              <EnvelopeIcon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden lg:inline">ご意見</span>
            </button>
            <button
              type="button"
              onClick={handleInviteFriends}
              className="h-10 w-10 rounded border border-sky-700 bg-sky-900/35 px-0 py-0 text-[11px] font-medium leading-none text-sky-200 hover:bg-sky-800/55 sm:w-auto sm:px-3 sm:py-2 sm:text-sm"
              title="この部屋の招待リンクを共有"
              aria-label="友達を招待"
            >
              <span className="sm:hidden">招待</span>
              <span className="hidden sm:inline">友達を招待</span>
            </button>
            <button
              type="button"
              onClick={handleLeaveClick}
              className="h-10 w-10 rounded border border-gray-600 bg-gray-800 px-0 py-0 text-[11px] font-medium leading-none text-gray-200 hover:bg-gray-700 hover:text-white sm:w-auto sm:px-4 sm:py-2 sm:text-sm"
              aria-label="部屋を退室して最初の画面に戻る"
            >
              退室
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
        onClose={handleCloseSiteFeedback}
        onSubmitted={() => markLeaveSiteFeedbackAnswered()}
        roomId={roomId}
        displayName={displayNameProp}
      />

      {inviteModalOpen && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="友達を招待"
          onClick={() => setInviteModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-gray-600 bg-gray-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-base font-semibold text-white">友達を招待</h2>
            <p className="mb-3 text-xs text-gray-300">送信先を選んでください</p>
            <div className="grid grid-cols-1 gap-2">
              <a href={inviteGmailUrl} target="_blank" rel="noopener noreferrer" className="rounded border border-gray-500 bg-gray-800 px-3 py-2 text-sm text-gray-100 hover:bg-gray-700">Gmailで送る</a>
              <a href={inviteOutlookUrl} target="_blank" rel="noopener noreferrer" className="rounded border border-gray-500 bg-gray-800 px-3 py-2 text-sm text-gray-100 hover:bg-gray-700">Outlookで送る</a>
              <a href={inviteLineUrl} target="_blank" rel="noopener noreferrer" className="rounded border border-gray-500 bg-gray-800 px-3 py-2 text-sm text-gray-100 hover:bg-gray-700">LINEで送る</a>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

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
              <ChatSummaryModalBody summary={chatSummary} />
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
            styleAdminChatTools={chatStyleAdminTools}
            canRejectTidbit={canRejectTidbit && !isGuest}
            onNextSongRecommendReject={handleNextSongRecommendReject}
            onYoutubeSearchFromAi={
              isYoutubeKeywordSearchEnabled()
                ? (q) => chatInputRef.current?.searchYoutubeWithQuery(q)
                : undefined
            }
            onSongQuizPick={handleSongQuizPick}
            themePlaylistActiveMission={themePlaylistRoomSubmit}
            themePlaylistMissionRoom={{
              roomId: roomId?.trim() || undefined,
              isGuest,
              favoritedVideoIds,
              onFavoriteClick: handleFavoriteClick,
              participantsWithColor: [{ displayName: displayNameProp, textColor: userTextColor }],
              currentVideoId: videoId,
            }}
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

      <section className="mt-2 shrink-0 space-y-2">
        <ChatInput
          ref={chatInputRef}
          onSendMessage={handleSendMessage}
          onVideoUrl={handleVideoUrlFromChat}
          themePlaylistRoomSubmit={themePlaylistRoomSubmit}
          isGuest={isGuest}
          onSystemMessage={addSystemMessage}
          onPreviewStart={handlePreviewStart}
          onPreviewStop={handlePreviewStop}
          onClearLocalAiQuestionGuard={
            chatStyleAdminTools ? clearLocalAiQuestionGuardState : undefined
          }
        />
      </section>
    </main>
  );
}
