'use client';

/**
 * チャット表示エリア（メッセージ一覧・末尾へスクロール）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getSafeInternalReturnPath } from '@/lib/safe-return-path';
import {
  HandThumbUpIcon,
  HandThumbDownIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  AtSymbolIcon,
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  MusicalNoteIcon,
} from '@heroicons/react/24/outline';
import { SongSelectionHowtoModal } from '@/components/chat/SongSelectionHowtoModal';
import { useIsLgViewport } from '@/hooks/useLgViewport';
import type { ChatMessage as ChatMessageType } from '@/types/chat';
import {
  getAiChatDisclaimerCommentsTabForDisplay,
  getAiConversationGuideQuestionTabForModal,
  JOIN_PASTE_YOUTUBE_URL_HINT_INTRO,
} from '@/lib/chat-system-copy';
import { AI_GUARD_OBJECTION_REASON_OPTIONS } from '@/lib/ai-guard-objection';
import {
  buildChatConversationSnapshotForAnchor,
  CHAT_CONVERSATION_SNAPSHOT_AFTER,
  CHAT_CONVERSATION_SNAPSHOT_BEFORE,
} from '@/lib/chat-conversation-snapshot';
import { isAiTidbitToolbarMessage, stripDbPrefixForChatDisplay } from '@/lib/ai-commentary-chat-display';
import {
  coerceSongQuizCorrectIndex,
  formatSongQuizFeedbackBody,
  isValidSongQuizTheme,
  SONG_QUIZ_THEME_UI_LABEL,
} from '@/lib/song-quiz-types';
import { THEME_PLAYLIST_SLOT_TARGET } from '@/lib/theme-playlist-definitions';
import {
  extractUiLabelFromBody,
  stripUiLabelPrefixFromBody,
} from '@/lib/chat-message-ui-labels';
import type { CommentPackSlotSelection } from '@/lib/comment-pack-slots';
import {
  DEFAULT_OWNER_AI_CHARACTER_JOIN_ENABLED,
  DEFAULT_OWNER_NEXT_SONG_RECOMMEND_ENABLED,
  DEFAULT_OWNER_SONG_QUIZ_ENABLED,
} from '@/types/room-owner';
import { formatMcDbMatchDisplayLine } from '@/lib/next-song-recommend-display';
import { postMyListItemClient } from '@/lib/my-list-client-post';
import type { ThemePlaylistRoomSubmitBanner } from '@/hooks/useThemePlaylistRoomSubmitMission';
import ThemePlaylistMissionEntriesModal, {
  type ThemePlaylistMissionEntriesModalRoomProps,
} from '@/components/chat/ThemePlaylistMissionEntriesModal';
import AiCharacterTtsReplayButton from '@/components/chat/AiCharacterTtsReplayButton';
import { AiTrialStatusBadge } from '@/components/shared/AiTrialStatusBadge';
import type { AiTrialStatus } from '@/lib/ai-trial-status';
import {
  AI_CHARACTER_DEFAULT_ANNOUNCE_NAME,
  canRequestSongOverviewAtQuestion,
  formatSongOverviewRequestButtonLabel,
  hasSongCommentaryForVideo,
  isAgentSelectionAnnounceName,
} from '@/lib/song-overview-request';
import { IS_MC_PRODUCT, chatHeaderIconBtnClass, roomFrameBlockClass, roomFrameInnerHeaderClass } from '@/lib/product-branding';
import { shouldApplyParticipantChatColorInline, labelTextOnBackground, mcParticipantSpeechColorForAnnounce, participantDisplayNamesMatch } from '@/lib/chat-text-color';

/** 詳細フィードバック用モーダルの状態 */
type FeedbackModalState =
  | { open: false }
  | {
      open: true;
      message: ChatMessageType;
      sending?: boolean;
      done?: boolean;
      /** 送信APIが返すメール送信結果（詳細FBのみ） */
      emailSent?: boolean;
      emailFailCode?: 'missing_api_key' | 'send_failed';
    };

type ObjectionModalState =
  | { open: false }
  | {
      open: true;
      message: ChatMessageType;
      sending?: boolean;
      done?: boolean;
      errorText?: string;
    };

type TuningReportModalState =
  | { open: false }
  | {
      open: true;
      message: ChatMessageType;
      sending?: boolean;
      done?: boolean;
      errorText?: string;
    };

interface ChatProps {
  messages: ChatMessageType[];
  /** 自分の表示名（一致する発言にテキスト色を適用） */
  currentUserDisplayName?: string;
  /** 自分の発言のテキスト色（未設定時は participantTextColors または白） */
  userTextColor?: string;
  /** 参加者ごとの発言色（clientId -> 色）。全員同じ色で表示するため全クライアントで共有 */
  participantTextColors?: Record<string, string>;
  /** 「〇〇さんの選曲です！」の〇〇の色を表示名で引く用。全員同じ画面にする */
  participantsWithColor?: { displayName: string; textColor?: string }[];
  /** 現在再生中の videoId（AIコメント評価用） */
  currentVideoId?: string | null;
  /** いま動画が再生中なら true（選曲案内の「はい」無効化用） */
  currentVideoPlaying?: boolean;
  /** song_tidbits をライブラリから外す NG（最高管理者のみ） */
  canRejectTidbit?: boolean;
  onTidbitLibraryReject?: (messageId: string, tidbitId: string) => void | Promise<void>;
  /** next_song_recommendations をライブラリから外す（最高管理者のみ） */
  onNextSongRecommendReject?: (messageId: string, recommendationId: string) => void | Promise<void>;
  /** 途中参加向けチャットサマリーを開く */
  onChatSummaryClick?: () => void;
  /** チャットログ（保存済み＋画面上）をモーダル表示 */
  onChatLogClick?: () => void;
  /** オーナー設定: 邦楽AI解説を解禁中ならヘッダー左に表示 */
  jpAiUnlockEnabled?: boolean;
  /** オーナー設定: ヘッダー「AI曲解説」ピル（曲紹介スロットが全非オフでない） */
  ownerAiCommentaryEnabled?: boolean;
  /** オーナー設定: 曲紹介スロット [1..5]（ヘッダー表示に使用） */
  ownerCommentPackSlots?: CommentPackSlotSelection;
  /** オーナー設定: ヘッダー「曲クイズ」ピル */
  ownerSongQuizEnabled?: boolean;
  /** オーナー設定: ヘッダー「おすすめ曲」ピル */
  ownerNextSongRecommendEnabled?: boolean;
  /** オーナー設定: ヘッダー「AIキャラクター参加」ピル */
  ownerAiCharacterJoinEnabled?: boolean;
  /** 部屋ID（異議申立てAPI用） */
  roomId?: string;
  /** 自分の Ably clientId（ガード警告の対象者のみ異議ボタンを出す） */
  myClientId?: string;
  /** STYLE_ADMIN のみ true（表記メタ記録ボタン） */
  styleAdminChatTools?: boolean;
  /** AI 検索用ブロック行の「検索」から発言欄の YouTube 検索モーダルを開く */
  onYoutubeSearchFromAi?: (query: string) => void;
  /** おすすめ曲の「選曲」（YouTube URL をプレイヤーへ） */
  onNextSongRecommendSelect?: (watchUrl: string) => void;
  /** ログイン時のみ true。おすすめに「マイリスト追加」を出す */
  myListAddEnabled?: boolean;
  /** マイリスト追加結果をシステムメッセージで通知 */
  onMyListAddNotice?: (message: string) => void;
  /** プレビュー開始・終了時に部屋プレイヤー音量をミュート／復元 */
  onPreviewStart?: (videoId: string) => void;
  onPreviewStop?: () => void;
  /** 曲解説後三択クイズの選択（同期部屋では Ably で共有） */
  onSongQuizPick?: (quizMessageId: string, videoId: string, pickedIndex: number) => void;
  /** 入室直後の選曲案内「はい」→ AI エージェントが先に選曲。成功時 true */
  onJoinPasteHintAiPick?: (messageId: string) => void | Promise<boolean>;
  /** 入室直後の選曲案内から部屋ライブラリを開く */
  onOpenLibraryFromChat?: () => void;
  /** マイページで進行中のお題ミッションがあるとき、ヘッダー2段目に進捗を表示 */
  themePlaylistActiveMission?: ThemePlaylistRoomSubmitBanner | null;
  /** 「実施中」モーダル: 視聴履歴と同様の列・お気に入り・年代スタイル補完用 */
  themePlaylistMissionRoom?: ThemePlaylistMissionEntriesModalRoomProps;
  /** ゲストなら true（AIお試し残・AI設定 は非表示） */
  viewerIsGuest?: boolean;
  /** 在室に Supabase 登録ユーザー（authUserId）が1人でもいる */
  roomHasRegisteredParticipant?: boolean;
  /** ログイン時の AI お試し残（GET /api/user/ai-trial） */
  aiTrialStatus?: AiTrialStatus | null;
  aiTrialLoading?: boolean;
  /** マイページ（ユーザー設定タブ）を開く */
  onAiSettingsClick?: () => void;
  /** ログイン時: 自分の選曲向け AI ON/OFF（ヘッダー「自分OFF」表示用） */
  personalAiCommentaryEnabled?: boolean;
  personalAiSongQuizEnabled?: boolean;
  personalAiRecommendEnabled?: boolean;
  /** エージェント表示名（選曲アナウンスの「〇〇さん」照合） */
  ownerAiCharacterName?: string;
  /** エージェント選曲アナウンスから概要をリクエスト（@1回・クレジット消費） */
  onRequestSongOverview?: (params: { messageId: string; videoId: string }) => void | Promise<void>;
  /** 自分が概要リクエスト済みの videoId（ボタン非表示用） */
  songOverviewRequestedVideoIds?: ReadonlySet<string>;
}

function formatTime(createdAt: string): string {
  try {
    const d = new Date(createdAt);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** 「〇〇さんの選曲です！」形式なら投稿者名を返す */
function getSelectorNameFromBody(body: string): string | null {
  const match = body.match(/^(.+?)さんの選曲(?:\s+お題（[^）]+）チャレンジ)?です！/);
  return match ? match[1].trim() : null;
}

/** UserBar の「AI」ラベル＋表示名と同じ読み（例: AI エージェント1号）でチャットバッジを揃える */
function aiCharacterParticipantBadgeLabel(displayName: string | undefined | null): string {
  const raw = (displayName ?? '').trim();
  const base = raw || 'エージェント1号';
  if (/^AI\s+/i.test(base)) return base;
  return `AI ${base}`;
}

function uiLabelClassName(label: string | null, opts?: { isCharacterChat?: boolean }): string {
  if (opts?.isCharacterChat) {
    return 'border-amber-500/70 bg-amber-900/35 text-amber-200';
  }
  if (!label) return 'border-gray-500/70 bg-gray-800/65 text-gray-200';
  if (label.startsWith('AI曲解説')) return 'border-sky-500/70 bg-sky-900/35 text-sky-200';
  if (label === '曲クイズ') return 'border-emerald-500/70 bg-emerald-900/35 text-emerald-200';
  if (label.startsWith('おすすめ曲')) return 'border-violet-500/70 bg-violet-900/35 text-violet-200';
  if (label === 'AIキャラ') return 'border-amber-500/70 bg-amber-900/35 text-amber-200';
  if (label === 'お題講評') return 'border-amber-500/70 bg-amber-900/40 text-amber-100';
  return 'border-gray-500/70 bg-gray-800/65 text-gray-200';
}

const stripUiLabelPrefix = stripUiLabelPrefixFromBody;

/** チャットヘッダー：オーナーON/OFFの状態表示（クリック不可） */
function ownerRoomFeatureHeaderPillClass(
  active: boolean,
  variant: 'commentary' | 'quiz' | 'recommend' | 'character',
): string {
  const base =
    'shrink-0 rounded border px-1.5 text-[10px] font-semibold leading-none tracking-tight';
  if (!active) {
    return `${base} border-gray-600/55 bg-gray-800/45 text-gray-500 py-0.5`;
  }
  if (variant === 'commentary') {
    return `${base} border-sky-500/70 bg-sky-900/35 text-sky-200`;
  }
  if (variant === 'quiz') {
    return `${base} border-emerald-500/70 bg-emerald-900/35 text-emerald-200`;
  }
  if (variant === 'character') {
    return `${base} border-amber-500/70 bg-amber-900/35 text-amber-200 py-0.5`;
  }
  return `${base} border-violet-500/70 bg-violet-900/35 text-violet-200`;
}

function OwnerRoomFeatureHeaderPill({
  active,
  variant,
  label,
  personalSelfOff = false,
  forceInactive = false,
  inactiveTitle,
}: {
  active: boolean;
  variant: 'commentary' | 'quiz' | 'recommend' | 'character';
  label: ReactNode;
  personalSelfOff?: boolean;
  /** ゲスト単独など、部屋設定はあるが選曲付随AIは出ないとき */
  forceInactive?: boolean;
  inactiveTitle?: string;
}) {
  const showSelfOff = active && personalSelfOff && !forceInactive;
  const pillActive = active && !forceInactive;
  return (
    <span
      className={`${ownerRoomFeatureHeaderPillClass(pillActive, variant)} inline-flex flex-col items-center justify-center gap-0.5 ${
        showSelfOff ? 'py-0.5' : 'py-0.5'
      }`}
      title={
        forceInactive
          ? inactiveTitle
          : showSelfOff
            ? '部屋ではオン。自分の選曲だけオフ'
            : undefined
      }
    >
      <span>{label}</span>
      {showSelfOff ? (
        <span className="text-[8px] font-medium leading-none text-gray-400/95">自分OFF</span>
      ) : null}
    </span>
  );
}

function resolveSelectorTextColor(
  selectorName: string,
  participantsWithColor: { displayName: string; textColor?: string }[],
  currentUserDisplayName?: string,
  userTextColor?: string,
): string | undefined {
  const fromList = participantsWithColor.find((p) =>
    participantDisplayNamesMatch(selectorName, p.displayName),
  )?.textColor;
  if (fromList?.trim()) return fromList.trim();
  const me = (currentUserDisplayName ?? '').trim();
  if (!me || !userTextColor?.trim()) return undefined;
  if (participantDisplayNamesMatch(selectorName, me)) {
    return userTextColor.trim();
  }
  return undefined;
}

/** 1行・「〇〇選曲♪」ラベル（BG=発言色・コントラスト文字）＋曲名（発言色）。MA/MC 共通 */
function renderSelectionAnnounceBodyAsLabel(
  body: string,
  selectorName: string,
  speechColor?: string,
): ReactNode {
  const lines = body.split('\n');
  const artistLine = (lines.length >= 2 ? lines[1] : lines[0] ?? '').trim();
  const rest = lines.length >= 2 ? lines.slice(2).join('\n').trim() : '';
  const label = `${selectorName}選曲♪`;
  const announceColor = mcParticipantSpeechColorForAnnounce(speechColor);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1 animate-song-intro-fade-in">
      <span
        className="mr-0.5 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
        style={{
          backgroundColor: announceColor,
          color: labelTextOnBackground(announceColor),
        }}
      >
        {label}
      </span>
      <span
        className="animate-song-intro-fade-in animate-song-line-fade-delayed"
        style={{ color: announceColor }}
      >
        {artistLine}
      </span>
      {rest ? (
        <>
          {' '}
          <span className="animate-song-intro-fade-in" style={{ color: announceColor }}>
            {rest}
          </span>
        </>
      ) : null}
    </span>
  );
}

function renderSelectionAnnounceBody(
  body: string,
  selectorName: string | null,
  labelColor?: string,
): ReactNode {
  if (selectorName) {
    return renderSelectionAnnounceBodyAsLabel(body, selectorName, labelColor);
  }
  const lines = body.split('\n');
  const artistLine = (lines.length >= 2 ? lines[1] : lines[0] ?? '').trim();
  return artistLine || body;
}

const DEFAULT_MESSAGE_COLOR = '#e5e7eb';

function isSongQuizFeedbackTarget(m: ChatMessageType): boolean {
  return m.messageType === 'system' && m.systemKind === 'song_quiz' && Boolean(m.songQuiz);
}

function isAiCommentaryFeedbackTarget(m: ChatMessageType): boolean {
  const body = stripUiLabelPrefix(m.body);
  return (
    m.messageType === 'ai' &&
    ((body.startsWith('[NEW]') || body.startsWith('[DB]')) || m.aiSource === 'next_song_recommend')
  );
}

/** 親指・詳細フィードバック用の本文と source（comment_feedback） */
function commentFeedbackPayloadForMessage(
  message: ChatMessageType,
): { commentBody: string; source: string } | null {
  if (isSongQuizFeedbackTarget(message) && message.songQuiz) {
    return { commentBody: formatSongQuizFeedbackBody(message.songQuiz), source: 'song_quiz' };
  }
  if (isAiCommentaryFeedbackTarget(message)) {
    return { commentBody: message.body, source: message.aiSource ?? 'other' };
  }
  return null;
}

function isNextSongRecommendFeedbackTarget(m: ChatMessageType): boolean {
  return m.messageType === 'ai' && m.aiSource === 'next_song_recommend' && Boolean(m.recommendationId);
}

function isDeferredNextSongRecommendMessage(m: ChatMessageType): boolean {
  return (
    m.messageType === 'ai' &&
    m.aiSource === 'next_song_recommend' &&
    m.deferToPanel === true &&
    m.nextSongRecommendPending !== true
  );
}

function tuningReportAnchorPreviewBody(m: ChatMessageType): string {
  if (m.systemKind === 'song_quiz' && m.songQuiz) return formatSongQuizFeedbackBody(m.songQuiz);
  return m.body;
}

/** AI 曲解説・comment-pack：固有名っぽい箇所を黄色（[NEW]・接続の「の」・括弧の外側は本文色） */
const AI_ARTIST_SONG_HIGHLIGHT_CLASS = 'font-semibold text-yellow-300';

/** モデレータ向け Music8 ヒット行（[Music8 …]）を黄緑で示す */
const AI_MUSIC8_HIT_LINE_CLASS = 'font-semibold text-lime-300';

const PACK_PREFIX_RE = /^(\[(?:NEW|DB)\]\s*)/;
/** `[Music8 アーチストJSON_Hit ソングJSON_Hit]` など先頭の1行 */
const MUSIC8_MODERATOR_LINE_RE = /^(\[Music8[^\]]+\]\s*(?:\n|$))/;
/** 本文末尾の YouTube 検索用ブロック（全角コロン＋ラベル。プロンプト `gemini.ts` と揃える） */
const AI_YT_SEARCH_TAIL_LINE_RE = /^(参考アルバム|シングル|代表曲)：\s*.+$/;
/** 映画「タイトル」／映画『タイトル』（括弧内のみ黄色） */
const MOVIE_QUOTED_RE = /映画(「([^」]{1,200})」|『([^』]{1,200})』)/g;
/** アルバム「タイトル」／アルバム『タイトル』 */
const ALBUM_QUOTED_RE = /アルバム(「([^」]{1,200})」|『([^』]{1,200})』)/g;
/** の直後が 『 または 「 でないときの「英字アーティスト名の」（例: Chicagoの輝かしい） */
const LATIN_ARTIST_NO_RE = /([A-Z][A-Za-z0-9\s&',.\-+]*?)の(?![『「])/g;
/** 和文内の英語曲名「Look Away」など（映画「…」・アルバム「…」より短い一致は重複解決で後勝ち） */
const JP_QUOTED_LATIN_TITLE_RE = /「([A-Za-z0-9][A-Za-z0-9\s',.\-+–]*)」/g;
/** 基本形：アーティストの『曲』／アーティストの「曲」（アーティストに「の」を含めない） */
const ARTIST_NO_TITLE_RE = /([^の\n]{1,220}?)の(『([^』]{0,300})』|「([^」]{0,300})」)/g;

/*
 * バンド名・参加アーチストの個人名の自動検出は、文中の一般名詞と区別できず誤爆が多いため未実装。
 * 必要なら「プロデューサーの〇〇」など限定パターンを別途足す。
 */

type PlainHighlightSeg = {
  start: number;
  end: number;
  nodes: ReactNode[];
};

function renderSearchBadgeInPlain(text: string, key: () => string): ReactNode[] {
  if (!text) return [];
  const parts = text.split('【キーワード】');
  if (parts.length <= 1) return [text];
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      out.push(
        <span
          key={key()}
          className="mx-1 inline-flex items-center rounded border border-gray-500/70 bg-gray-800/70 px-1.5 py-0.5 text-[10px] font-semibold text-gray-200"
        >
          キーワード
        </span>,
      );
    }
    if (parts[i]) out.push(parts[i]);
  }
  return out;
}

function extractKeywordQuery(body: string): string | null {
  const m = body.match(/【キーワード】\s*(.+)$/);
  if (!m) return null;
  const q = (m[1] ?? '').trim();
  return q ? q : null;
}

function highlightPlainSegment(rest: string, key: () => string): ReactNode[] {
  if (!rest) return [];
  const segs: PlainHighlightSeg[] = [];
  let m: RegExpExecArray | null;

  const reMovie = new RegExp(MOVIE_QUOTED_RE.source, MOVIE_QUOTED_RE.flags);
  while ((m = reMovie.exec(rest)) !== null) {
    const inner = (m[2] ?? m[3] ?? '').trim();
    const open = m[2] !== undefined ? '「' : '『';
    const close = open === '「' ? '」' : '』';
    segs.push({
      start: m.index,
      end: m.index + m[0].length,
      nodes: [
        '映画',
        open,
        <span key={key()} className={AI_ARTIST_SONG_HIGHLIGHT_CLASS}>{inner}</span>,
        close,
      ],
    });
  }
  const reAlbum = new RegExp(ALBUM_QUOTED_RE.source, ALBUM_QUOTED_RE.flags);
  while ((m = reAlbum.exec(rest)) !== null) {
    const inner = (m[2] ?? m[3] ?? '').trim();
    const open = m[2] !== undefined ? '「' : '『';
    const close = open === '「' ? '」' : '』';
    segs.push({
      start: m.index,
      end: m.index + m[0].length,
      nodes: [
        'アルバム',
        open,
        <span key={key()} className={AI_ARTIST_SONG_HIGHLIGHT_CLASS}>{inner}</span>,
        close,
      ],
    });
  }

  const reLat = new RegExp(LATIN_ARTIST_NO_RE.source, LATIN_ARTIST_NO_RE.flags);
  while ((m = reLat.exec(rest)) !== null) {
    segs.push({
      start: m.index,
      end: m.index + m[0].length,
      nodes: [
        <span key={key()} className={AI_ARTIST_SONG_HIGHLIGHT_CLASS}>{m[1]}</span>,
        'の',
      ],
    });
  }
  const reJp = new RegExp(JP_QUOTED_LATIN_TITLE_RE.source, JP_QUOTED_LATIN_TITLE_RE.flags);
  while ((m = reJp.exec(rest)) !== null) {
    segs.push({
      start: m.index,
      end: m.index + m[0].length,
      nodes: [
        '「',
        <span key={key()} className={AI_ARTIST_SONG_HIGHLIGHT_CLASS}>{m[1]}</span>,
        '」',
      ],
    });
  }
  segs.sort((a, b) => a.start - b.start);
  const kept: PlainHighlightSeg[] = [];
  let prevEnd = -1;
  for (const s of segs) {
    if (s.start >= prevEnd) {
      kept.push(s);
      prevEnd = s.end;
    }
  }
  if (kept.length === 0) return renderSearchBadgeInPlain(rest, key);
  const out: ReactNode[] = [];
  let last = 0;
  for (const s of kept) {
    if (s.start > last) out.push(...renderSearchBadgeInPlain(rest.slice(last, s.start), key));
    out.push(...s.nodes);
    last = s.end;
  }
  if (last < rest.length) out.push(...renderSearchBadgeInPlain(rest.slice(last), key));
  return out;
}

/** 末尾から連続する「参考アルバム：／シングル：／代表曲：」行だけを切り出す（空行で打ち切り） */
function extractTrailingAiYoutubeSearchLines(rest: string): { mainRest: string; tailLines: string[] } {
  const lines = rest.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  const tailLines: string[] = [];
  while (lines.length > 0) {
    const raw = lines[lines.length - 1];
    const trimmed = raw.trim();
    if (trimmed === '') break;
    if (!AI_YT_SEARCH_TAIL_LINE_RE.test(trimmed)) break;
    tailLines.unshift(lines.pop()!);
  }
  return { mainRest: lines.join('\n'), tailLines };
}

type NextSongRecommendPlayActions = {
  watchUrl: string;
  videoId: string;
  libraryMatchLine: string;
  onSelect: () => void;
  onPreview: () => void;
  onAddToMyList?: () => void;
  myListAddBusy?: boolean;
};

function parseNextSongRecommendArtistTitle(body: string): { artist: string; title: string } | null {
  const m = body.match(/♪\s*(.+?)「([^」]+)」/);
  if (!m?.[1] || !m[2]) return null;
  return { artist: m[1].trim(), title: m[2].trim() };
}

function renderNextSongRecommendKeywordSection(
  keywordQuery: string,
  play?: NextSongRecommendPlayActions,
): ReactNode {
  return (
    <>
      <span className="mt-1 block">
        <span className="mr-1 inline-flex items-center rounded border border-gray-500/70 bg-gray-800/70 px-1.5 py-0.5 text-[10px] font-semibold text-gray-200">
          キーワード
        </span>
        <span className="mr-2 align-middle">{keywordQuery}</span>
        <a
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(keywordQuery)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md border border-slate-400/60 bg-slate-200/85 px-2 py-0.5 text-[10px] font-semibold text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-100 hover:shadow"
        >
          検索
          <ArrowTopRightOnSquareIcon className="ml-1 h-3 w-3" aria-hidden />
        </a>
      </span>
      {play ? (
        <span className="mt-1 block">
          <span className="mr-1 inline-flex items-center rounded border border-violet-600/60 bg-violet-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200">
            ライブラリにマッチ
          </span>
          <span className="mr-2 align-middle text-[11px] text-gray-100">{play.libraryMatchLine}</span>
          <button
            type="button"
            className="mr-1 inline-flex items-center rounded-md border border-lime-500/70 bg-lime-900/40 px-2 py-0.5 text-[10px] font-semibold text-lime-100 shadow-sm transition hover:bg-lime-900/70"
            title="ライブラリ登録済みの URL で選曲"
            onClick={play.onSelect}
          >
            選曲
          </button>
          <button
            type="button"
            className="mr-1 inline-flex items-center rounded-md border border-gray-500/70 bg-gray-800/80 px-2 py-0.5 text-[10px] font-semibold text-gray-100 shadow-sm transition hover:bg-gray-700"
            title="YouTube プレビュー（部屋の再生音はミュート）"
            onClick={play.onPreview}
          >
            プレビュー
          </button>
          {play.onAddToMyList ? (
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-violet-600/60 bg-violet-900/40 px-2 py-0.5 text-[10px] font-semibold text-violet-100 shadow-sm transition hover:bg-violet-900/60 disabled:cursor-not-allowed disabled:opacity-60"
              title="マイページのマイリストに追加（チャット選曲とは別）"
              disabled={play.myListAddBusy}
              onClick={play.onAddToMyList}
            >
              {play.myListAddBusy ? '追加中…' : 'マイリスト追加'}
            </button>
          ) : null}
        </span>
      ) : null}
    </>
  );
}

/** 検索モーダル用のクエリ。特定不可の定型文のときは null */
function parseAiYoutubeSearchQuery(line: string): string | null {
  const t = line.trim();
  const m = t.match(/^(参考アルバム|シングル|代表曲)：\s*(.+)$/);
  if (!m) return null;
  const q = m[2].trim();
  if (!q || /特定できません/.test(q)) return null;
  return q;
}

function renderAiBodyWithArtistSongHighlight(
  body: string,
  opts?: {
    keyPrefix?: string;
    onYoutubeSearch?: (query: string) => void;
    nextSongRecommendPlay?: NextSongRecommendPlayActions;
  },
): ReactNode {
  const pm = body.match(PACK_PREFIX_RE);
  const prefix = pm?.[1] ?? '';
  const afterPackPrefix = pm ? body.slice(pm[0].length) : body;

  const mm = afterPackPrefix.match(MUSIC8_MODERATOR_LINE_RE);
  const music8Line = mm?.[1] ?? '';
  const rest = mm ? afterPackPrefix.slice(mm[0].length) : afterPackPrefix;

  const { mainRest, tailLines } = opts?.onYoutubeSearch
    ? extractTrailingAiYoutubeSearchLines(rest)
    : { mainRest: rest, tailLines: [] as string[] };
  const hasSearchTailRows = tailLines.length > 0;
  const keywordMatch = mainRest.match(/^([\s\S]*?)(?:\s*)(?:【キーワード】|検索用[:：])\s*(.+)$/);
  const mainRestWithoutKeyword = keywordMatch ? (keywordMatch[1] ?? '').trimEnd() : mainRest;
  const keywordQuery = keywordMatch
    ? (keywordMatch[2] ?? '').trim()
    : extractKeywordQuery(body);

  let k = 0;
  const key = () => `${opts?.keyPrefix ?? 'ai'}-hl-${k++}`;

  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const primary = new RegExp(ARTIST_NO_TITLE_RE.source, ARTIST_NO_TITLE_RE.flags);
  while ((m = primary.exec(mainRestWithoutKeyword)) !== null) {
    if (m.index > last) {
      out.push(...highlightPlainSegment(mainRestWithoutKeyword.slice(last, m.index), key));
    }
    const artist = m[1];
    const song = (m[3] ?? m[4] ?? '').trim();
    const quote = m[2];
    const q0 = quote[0] ?? '『';
    const q1 = quote[quote.length - 1] ?? '』';
    out.push(<span key={key()} className={AI_ARTIST_SONG_HIGHLIGHT_CLASS}>{artist}</span>);
    out.push('の');
    out.push(q0);
    out.push(<span key={key()} className={AI_ARTIST_SONG_HIGHLIGHT_CLASS}>{song}</span>);
    out.push(q1);
    last = m.index + m[0].length;
  }

  if (last < mainRestWithoutKeyword.length) {
    out.push(...highlightPlainSegment(mainRestWithoutKeyword.slice(last), key));
  }

  if (!hasSearchTailRows) {
    if (!prefix && !music8Line && out.length === 0) return body;
    // keywordQuery があるときは下のフラグメントでキーワード行を付ける必要がある（単一文字列の早期 return では落ちる）
    if (!prefix && !music8Line && out.length === 1 && typeof out[0] === 'string' && !keywordQuery)
      return out[0] as string;

    return (
      <>
        {prefix}
        {music8Line ? (
          <span className={AI_MUSIC8_HIT_LINE_CLASS}>{music8Line}</span>
        ) : null}
        {out.length > 0 ? out : mainRestWithoutKeyword}
        {keywordQuery ? renderNextSongRecommendKeywordSection(keywordQuery, opts?.nextSongRecommendPlay) : null}
      </>
    );
  }

  return (
    <>
      {prefix}
      {music8Line ? (
        <span className={AI_MUSIC8_HIT_LINE_CLASS}>{music8Line}</span>
      ) : null}
      <span className="whitespace-pre-wrap">{out.length > 0 ? out : mainRestWithoutKeyword}</span>
      {tailLines.map((line, idx) => {
        const q = parseAiYoutubeSearchQuery(line);
        return (
          <span
            key={`${opts?.keyPrefix ?? 'ai'}-yt-tail-${idx}`}
            className={`block ${idx === 0 ? 'mt-1' : 'mt-0.5'}`}
          >
            <span className="whitespace-pre-wrap align-baseline">{highlightPlainSegment(line, key)}</span>
            {q && opts?.onYoutubeSearch ? (
              <button
                type="button"
                className="ml-2 inline-flex align-baseline rounded border border-blue-500/60 bg-blue-900/25 px-2 py-0.5 text-[11px] font-medium text-blue-200 hover:bg-blue-900/45"
                onClick={() => {
                  const fn = opts.onYoutubeSearch;
                  if (fn) fn(q);
                }}
              >
                検索
              </button>
            ) : null}
          </span>
        );
      })}
      {keywordQuery ? renderNextSongRecommendKeywordSection(keywordQuery, opts?.nextSongRecommendPlay) : null}
    </>
  );
}

export default function Chat({
  messages,
  currentUserDisplayName,
  userTextColor,
  participantTextColors = {},
  participantsWithColor = [],
  currentVideoId,
  currentVideoPlaying = false,
  canRejectTidbit = false,
  onTidbitLibraryReject,
  onNextSongRecommendReject,
  onChatSummaryClick,
  onChatLogClick,
  jpAiUnlockEnabled = false,
  ownerAiCommentaryEnabled = true,
  ownerCommentPackSlots,
  ownerSongQuizEnabled = DEFAULT_OWNER_SONG_QUIZ_ENABLED,
  ownerNextSongRecommendEnabled = DEFAULT_OWNER_NEXT_SONG_RECOMMEND_ENABLED,
  ownerAiCharacterJoinEnabled = DEFAULT_OWNER_AI_CHARACTER_JOIN_ENABLED,
  roomId,
  myClientId,
  styleAdminChatTools = false,
  onYoutubeSearchFromAi,
  onNextSongRecommendSelect,
  myListAddEnabled = false,
  onMyListAddNotice,
  onPreviewStart,
  onPreviewStop,
  onSongQuizPick,
  onJoinPasteHintAiPick,
  onOpenLibraryFromChat,
  themePlaylistActiveMission = null,
  themePlaylistMissionRoom,
  viewerIsGuest = false,
  roomHasRegisteredParticipant = true,
  aiTrialStatus = null,
  aiTrialLoading = false,
  onAiSettingsClick,
  personalAiCommentaryEnabled = true,
  personalAiSongQuizEnabled = true,
  personalAiRecommendEnabled = true,
  ownerAiCharacterName = 'エージェント1号',
  onRequestSongOverview,
  songOverviewRequestedVideoIds,
}: ChatProps) {
  const chatStyleAdminEnabled = !IS_MC_PRODUCT && styleAdminChatTools;
  const chatModeratorToolsEnabled = !IS_MC_PRODUCT && canRejectTidbit;
  const pathname = usePathname();
  const pathSegs = pathname?.split('/').filter(Boolean) ?? [];
  const roomPathSegment = pathSegs.length === 1 ? pathSegs[0] : null;
  const guideAiHref =
    roomPathSegment && getSafeInternalReturnPath(roomPathSegment)
      ? `/guide/ai?returnTo=${encodeURIComponent(roomPathSegment)}`
      : '/guide/ai';

  const [nextRecPreview, setNextRecPreview] = useState<{
    videoId: string;
    artist: string;
    title: string;
    watchUrl: string;
    inMcDb: boolean;
    inMusic8: boolean;
    libraryMatchLine: string;
  } | null>(null);
  const [myListAddBusyVideoId, setMyListAddBusyVideoId] = useState<string | null>(null);
  const [songHowtoOpen, setSongHowtoOpen] = useState(false);
  const [joinPasteHintAiPickBusyId, setJoinPasteHintAiPickBusyId] = useState<string | null>(null);
  const [joinPasteHintAiPickDoneIds, setJoinPasteHintAiPickDoneIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [songOverviewRequestBusyVideoId, setSongOverviewRequestBusyVideoId] = useState<string | null>(
    null,
  );

  const addNextSongRecommendToMyList = useCallback(
    async (payload: {
      videoId: string;
      watchUrl: string;
      artist?: string | null;
      title?: string | null;
    }) => {
      if (!myListAddEnabled || !onMyListAddNotice) return;
      if (myListAddBusyVideoId) return;
      setMyListAddBusyVideoId(payload.videoId);
      try {
        const result = await postMyListItemClient({
          videoId: payload.videoId,
          url: payload.watchUrl,
          artist: payload.artist?.trim() || null,
          title: payload.title?.trim() || null,
          source: 'manual_url',
        });
        if (!result.ok) {
          onMyListAddNotice(
            result.status === 401
              ? 'マイリストに追加するにはログインしてください。'
              : result.error,
          );
          return;
        }
        onMyListAddNotice(
          result.duplicate
            ? 'すでにマイリストにあります（同一動画は1件まで）。'
            : 'マイリストに追加しました。マイページの「マイリスト」タブで確認できます。',
        );
      } finally {
        setMyListAddBusyVideoId(null);
      }
    },
    [myListAddEnabled, onMyListAddNotice, myListAddBusyVideoId],
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollPaneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!nextRecPreview?.videoId) {
      onPreviewStop?.();
      return;
    }
    onPreviewStart?.(nextRecPreview.videoId);
    return () => {
      onPreviewStop?.();
    };
  }, [nextRecPreview?.videoId, onPreviewStart, onPreviewStop]);
  const aiCommentaryObserverRef = useRef<IntersectionObserver | null>(null);
  const aiCommentaryNodeRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const [visibleAiCommentaryIds, setVisibleAiCommentaryIds] = useState<Record<string, true>>({});
  const [feedbackState, setFeedbackState] = useState<Record<string, 'up' | 'down'>>({});
  const [feedbackModal, setFeedbackModal] = useState<FeedbackModalState>({ open: false });
  const [objectionModal, setObjectionModal] = useState<ObjectionModalState>({ open: false });
  const [objectionReasons, setObjectionReasons] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(AI_GUARD_OBJECTION_REASON_OPTIONS.map((o) => [o.id, false])),
  );
  const [objectionComment, setObjectionComment] = useState('');
  const [tuningReportModal, setTuningReportModal] = useState<TuningReportModalState>({ open: false });
  const [tuningReportNote, setTuningReportNote] = useState('');
  const [detailChecks, setDetailChecks] = useState({ duplicate: false, dubious: false, ambiguous: false });
  const [detailComment, setDetailComment] = useState('');
  const [tidbitRejectingId, setTidbitRejectingId] = useState<string | null>(null);
  const [nextSongRecRejectingId, setNextSongRecRejectingId] = useState<string | null>(null);
  const [artistTitleReportingId, setArtistTitleReportingId] = useState<string | null>(null);
  const [themeMissionModalOpen, setThemeMissionModalOpen] = useState(false);
  /** 三択クイズ: メッセージ id → 選んだ選択肢 index */
  const [songQuizPickedIndex, setSongQuizPickedIndex] = useState<Record<string, number>>({});
  const deferredNextSongRecommendMessages = messages.filter(isDeferredNextSongRecommendMessage);
  const visibleMessages = messages.filter((m) => !isDeferredNextSongRecommendMessage(m));

  useEffect(() => {
    const bottom = bottomRef.current;
    if (!bottom) return;
    const below = bottom.closest('.mc-room-mobile-below') as HTMLElement | null;
    if (below && below.classList.contains('mc-room-scroll-pane')) {
      below.scrollTop = below.scrollHeight;
      return;
    }
    const pane = scrollPaneRef.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (!themePlaylistActiveMission && themeMissionModalOpen) {
      setThemeMissionModalOpen(false);
    }
  }, [themePlaylistActiveMission, themeMissionModalOpen]);

  const registerAiCommentaryNode = useCallback((id: string, node: HTMLLIElement | null) => {
    const map = aiCommentaryNodeRefs.current;
    const prev = map.get(id);
    if (prev && prev !== node && aiCommentaryObserverRef.current) {
      aiCommentaryObserverRef.current.unobserve(prev);
      map.delete(id);
    }
    if (!node) return;
    map.set(id, node);
    if (aiCommentaryObserverRef.current) {
      aiCommentaryObserverRef.current.observe(node);
    }
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = (entry.target as HTMLElement).dataset.messageId;
          if (!id) return;
          setVisibleAiCommentaryIds((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
          observer.unobserve(entry.target);
        });
      },
      {
        root: null,
        rootMargin: '0px 0px -8% 0px',
        threshold: 0.2,
      },
    );
    aiCommentaryObserverRef.current = observer;
    aiCommentaryNodeRefs.current.forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
      aiCommentaryObserverRef.current = null;
    };
  }, []);

  function sendFeedback(message: ChatMessageType, isUpvote: boolean) {
    const fbPayload = commentFeedbackPayloadForMessage(message);
    if (!fbPayload) return;
    const current = feedbackState[message.id];
    // 同じアイコンを2回目クリックしたら解除（サーバーには再送しない）
    if ((isUpvote && current === 'up') || (!isUpvote && current === 'down')) {
      setFeedbackState((prev) => {
        const { [message.id]: _removed, ...rest } = prev;
        return rest;
      });
      return;
    }
    setFeedbackState((prev) => ({
      ...prev,
      [message.id]: isUpvote ? 'up' : 'down',
    }));
    const videoIdToSend =
      (typeof message.videoId === 'string' && message.videoId.trim()
        ? message.videoId.trim()
        : undefined) ??
      (typeof currentVideoId === 'string' && currentVideoId.trim()
        ? currentVideoId.trim()
        : undefined) ??
      null;
    if (isNextSongRecommendFeedbackTarget(message)) {
      fetch('/api/next-song-recommend-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendationId: message.recommendationId,
          isUpvote,
        }),
      }).catch(() => {});
      return;
    }
    fetch('/api/comment-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: message.songId ?? null,
        videoId: videoIdToSend,
        aiMessageId: message.id,
        commentBody: fbPayload.commentBody,
        source: fbPayload.source,
        isUpvote,
      }),
    }).catch(() => {});
  }

  function openFeedbackModal(message: ChatMessageType) {
    setDetailChecks({ duplicate: false, dubious: false, ambiguous: false });
    setDetailComment('');
    setFeedbackModal({ open: true, message });
  }

  function canSaveArtistTitleMeta(m: ChatMessageType): boolean {
    if (m.messageType !== 'ai' || !m.videoId?.trim()) return false;
    const body = stripUiLabelPrefix(m.body);
    if (body.includes('再生が終了したら次の曲をどうぞ')) return false;
    return (
      getSelectorNameFromBody(body) != null ||
      body.startsWith('[NEW]') ||
      body.startsWith('[DB]')
    );
  }

  function artistTitleReportMessageKind(m: ChatMessageType): 'announce_song' | 'song_commentary' {
    return getSelectorNameFromBody(stripUiLabelPrefix(m.body)) != null
      ? 'announce_song'
      : 'song_commentary';
  }

  async function submitArtistTitleReport(m: ChatMessageType) {
    if (!chatStyleAdminEnabled || !canSaveArtistTitleMeta(m)) return;
    const vid = m.videoId!.trim();
    const note = window.prompt('メモ（任意・不具合の気づきなど）', '') ?? '';
    setArtistTitleReportingId(m.id);
    try {
      const res = await fetch('/api/admin/artist-title-parse-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: roomId?.trim() || undefined,
          videoId: vid,
          messageKind: artistTitleReportMessageKind(m),
          chatBody: m.body.slice(0, 12000),
          reporterNote: note.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
      if (!res.ok) {
        window.alert(
          data.error
            ? `${data.error}${data.hint ? `\n\n${data.hint}` : ''}`
            : '保存に失敗しました。',
        );
        return;
      }
      window.alert('管理画面に保存しました。\n/admin/artist-title-parse-reports');
    } finally {
      setArtistTitleReportingId((cur) => (cur === m.id ? null : cur));
    }
  }

  async function sendDetailFeedback() {
    if (!feedbackModal.open || feedbackModal.done || feedbackModal.sending) return;
    const message = feedbackModal.message;
    const fbPayload = commentFeedbackPayloadForMessage(message);
    if (!fbPayload) return;
    const videoIdToSend =
      (typeof message.videoId === 'string' && message.videoId.trim() ? message.videoId.trim() : undefined) ??
      (typeof currentVideoId === 'string' && currentVideoId?.trim() ? currentVideoId.trim() : undefined) ??
      null;
    setFeedbackModal((prev) => (prev.open ? { ...prev, sending: true } : prev));
    try {
      const res = isNextSongRecommendFeedbackTarget(message)
        ? await fetch('/api/next-song-recommend-feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recommendationId: message.recommendationId,
              isUpvote: false,
              comment: detailComment.trim(),
            }),
          })
        : await fetch('/api/comment-feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              songId: message.songId ?? null,
              videoId: videoIdToSend,
              aiMessageId: message.id,
              commentBody: fbPayload.commentBody,
              source: fbPayload.source,
              detailFeedback: {
                isDuplicate: detailChecks.duplicate,
                isDubious: detailChecks.dubious,
                isAmbiguous: detailChecks.ambiguous,
                freeComment: detailComment.trim(),
              },
            }),
          });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          emailSent?: boolean;
          emailFailCode?: 'missing_api_key' | 'send_failed';
        };
        setFeedbackModal((prev) =>
          prev.open
            ? {
                ...prev,
                sending: false,
                done: true,
                emailSent: typeof data.emailSent === 'boolean' ? data.emailSent : undefined,
                emailFailCode: data.emailFailCode,
              }
            : prev,
        );
      } else {
        setFeedbackModal((prev) => (prev.open ? { ...prev, sending: false } : prev));
      }
    } catch {
      setFeedbackModal((prev) => (prev.open ? { ...prev, sending: false } : prev));
    }
  }

  function closeFeedbackModal() {
    setFeedbackModal({ open: false });
  }

  function openObjectionModal(message: ChatMessageType) {
    setObjectionReasons(Object.fromEntries(AI_GUARD_OBJECTION_REASON_OPTIONS.map((o) => [o.id, false])));
    setObjectionComment('');
    setObjectionModal({ open: true, message });
  }

  function closeObjectionModal() {
    setObjectionModal({ open: false });
  }

  function openTuningReportModal(message: ChatMessageType) {
    setTuningReportNote('');
    setTuningReportModal({ open: true, message });
  }

  function closeTuningReportModal() {
    setTuningReportModal({ open: false });
  }

  async function sendTuningReport() {
    if (!tuningReportModal.open || tuningReportModal.done || tuningReportModal.sending) return;
    const message = tuningReportModal.message;
    if (!roomId?.trim()) {
      setTuningReportModal((prev) =>
        prev.open ? { ...prev, errorText: '部屋情報が取得できません。ページを再読み込みしてください。' } : prev,
      );
      return;
    }
    const note = tuningReportNote.trim();
    if (!note) {
      setTuningReportModal((prev) =>
        prev.open ? { ...prev, errorText: 'メモを入力してください（改善したい点・検討事項など）。' } : prev,
      );
      return;
    }
    const snapshot = buildChatConversationSnapshotForAnchor(messages, message.id);
    if (snapshot.length === 0) {
      setTuningReportModal((prev) =>
        prev.open ? { ...prev, errorText: '会話の取得に失敗しました。' } : prev,
      );
      return;
    }
    setTuningReportModal((prev) => (prev.open ? { ...prev, sending: true, errorText: undefined } : prev));
    try {
      const res = await fetch('/api/ai-chat-tuning-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: roomId.trim(),
          anchorMessageId: message.id,
          anchorMessageType: message.messageType,
          moderatorNote: note,
          conversationSnapshot: snapshot,
          currentVideoId: currentVideoId ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setTuningReportModal((prev) =>
          prev.open
            ? {
                ...prev,
                sending: false,
                errorText: typeof data.error === 'string' ? data.error : '送信に失敗しました。',
              }
            : prev,
        );
        return;
      }
      setTuningReportModal((prev) =>
        prev.open ? { ...prev, sending: false, done: true, errorText: undefined } : prev,
      );
    } catch {
      setTuningReportModal((prev) =>
        prev.open
          ? { ...prev, sending: false, errorText: '送信に失敗しました。ネットワークを確認してください。' }
          : prev,
      );
    }
  }

  function objectionAlreadySent(messageId: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem(`ai-guard-objection-sent:${messageId}`) === '1';
    } catch {
      return false;
    }
  }

  async function sendObjection() {
    if (!objectionModal.open || objectionModal.done || objectionModal.sending) return;
    const message = objectionModal.message;
    const meta = message.aiGuardMeta;
    if (!meta || !roomId?.trim()) {
      setObjectionModal((prev) =>
        prev.open ? { ...prev, errorText: '部屋情報が取得できません。ページを再読み込みしてください。' } : prev,
      );
      return;
    }
    const keys = AI_GUARD_OBJECTION_REASON_OPTIONS.filter((o) => objectionReasons[o.id]).map((o) => o.id);
    if (keys.length === 0) {
      setObjectionModal((prev) =>
        prev.open ? { ...prev, errorText: '異議理由を1つ以上選んでください。' } : prev,
      );
      return;
    }
    const snapshot = buildChatConversationSnapshotForAnchor(messages, message.id);
    if (snapshot.length === 0) {
      setObjectionModal((prev) =>
        prev.open ? { ...prev, errorText: '会話の取得に失敗しました。' } : prev,
      );
      return;
    }
    setObjectionModal((prev) => (prev.open ? { ...prev, sending: true, errorText: undefined } : prev));
    try {
      const res = await fetch('/api/ai-question-guard-objection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: roomId.trim(),
          chatMessageId: message.id,
          systemMessageBody: message.body,
          warningCount: meta.warningCount,
          guardAction: meta.action,
          reasonKeys: keys,
          freeComment: objectionComment.trim(),
          conversationSnapshot: snapshot,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        try {
          sessionStorage.setItem(`ai-guard-objection-sent:${message.id}`, '1');
        } catch {
          /* noop */
        }
        setObjectionModal((prev) =>
          prev.open
            ? {
                ...prev,
                sending: false,
                done: true,
                errorText: undefined,
              }
            : prev,
        );
        return;
      }
      if (!res.ok) {
        setObjectionModal((prev) =>
          prev.open
            ? {
                ...prev,
                sending: false,
                errorText: typeof data.error === 'string' ? data.error : '送信に失敗しました。',
              }
            : prev,
        );
        return;
      }
      try {
        sessionStorage.setItem(`ai-guard-objection-sent:${message.id}`, '1');
      } catch {
        /* noop */
      }
      setObjectionModal((prev) =>
        prev.open ? { ...prev, sending: false, done: true, errorText: undefined } : prev,
      );
    } catch {
      setObjectionModal((prev) =>
        prev.open
          ? { ...prev, sending: false, errorText: '送信に失敗しました。ネットワークを確認してください。' }
          : prev,
      );
    }
  }

  const [aiHelpModalOpen, setAiHelpModalOpen] = useState(false);
  const [aiHelpModalTab, setAiHelpModalTab] = useState<'question' | 'comments'>('question');
  const [aiQuestionExamplesOpen, setAiQuestionExamplesOpen] = useState(false);
  const [chatHeaderMoreOpen, setChatHeaderMoreOpen] = useState(false);
  const chatHeaderMoreRef = useRef<HTMLDivElement>(null);
  const isLg = useIsLgViewport();

  useEffect(() => {
    if (!chatHeaderMoreOpen) return;
    const onDocPointer = (e: MouseEvent) => {
      if (chatHeaderMoreRef.current?.contains(e.target as Node)) return;
      setChatHeaderMoreOpen(false);
    };
    document.addEventListener('mousedown', onDocPointer);
    return () => document.removeEventListener('mousedown', onDocPointer);
  }, [chatHeaderMoreOpen]);
  const ownerCommentarySlotNumbers = (ownerCommentPackSlots ?? [])
    .map((enabled, i) => (enabled ? String(i + 1) : null))
    .filter((v): v is string => v !== null)
    .join(' ');
  const ownerCommentarySlotSuffix =
    ownerCommentarySlotNumbers === '1 2 3 4 5'
      ? 'ALL'
      : ownerCommentarySlotNumbers;
  /** ゲストのみ・登録ユーザー不在 → 自分の選曲では AI 付随機能は出ない */
  const guestSelectionAiHeaderOff = viewerIsGuest && !roomHasRegisteredParticipant;
  const guestSelectionAiHeaderTitle =
    '登録ユーザーの選曲時のみ有効（ゲストは AI 付き選曲不可）';
  const headerCommentaryActive = ownerAiCommentaryEnabled && !guestSelectionAiHeaderOff;
  const headerQuizActive = ownerSongQuizEnabled && !guestSelectionAiHeaderOff;
  const headerRecommendActive = ownerNextSongRecommendEnabled && !guestSelectionAiHeaderOff;
  const aiQuestionExamples = [
    {
      question: '@アヴリル・ラヴィーンのデビュー曲は？',
      answer:
        '「Complicated」です。2002年のアルバム『Let Go』からのリードシングルとして広く知られています。',
    },
    {
      question: '@アヴリル・ラヴィーンのデビュー当時のライバルは？',
      answer:
        '「ライバル」というより、当時のポップ主流（ブリトニー・スピアーズ、クリスティーナ・アギレラ等）と対比される存在でした。',
    },
    {
      question: '@アヴリル・ラヴィーンの人気曲は？',
      answer:
        '代表的には「Complicated」「Sk8er Boi」「My Happy Ending」「Girlfriend」などがよく挙げられます。',
    },
  ] as const;

  return (
    <div className={roomFrameBlockClass('flex min-h-0 flex-1 flex-col')}>
      <div
        className={roomFrameInnerHeaderClass(
          'flex shrink-0 flex-nowrap items-center gap-x-2 gap-y-0 max-lg:py-1.5 lg:flex-wrap lg:items-center lg:gap-x-3 lg:gap-y-1.5',
        )}
      >
        {onChatLogClick ? (
          <button
            type="button"
            onClick={onChatLogClick}
            className={chatHeaderIconBtnClass()}
            aria-label="チャットログを表示"
            title="チャットログ（今回の会または今日）"
          >
            <DocumentTextIcon className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        <span
          className={`shrink-0 text-sm font-medium ${IS_MC_PRODUCT ? 'text-gray-800' : 'text-gray-300'}`}
          title="参加者同士のチャット欄です。"
        >
          チャット
        </span>
        {!IS_MC_PRODUCT ? (
        <div
          className="inline-flex min-w-0 flex-1 flex-nowrap items-center gap-x-1.5 overflow-x-auto lg:flex-wrap lg:gap-x-2 lg:gap-y-1 lg:overflow-visible"
          role="status"
          aria-label={`部屋のAI機能: 曲解説${headerCommentaryActive ? 'オン' : 'オフ'}${
            headerCommentaryActive && !personalAiCommentaryEnabled && !viewerIsGuest
              ? '（自分オフ）'
              : ''
          }、曲クイズ${headerQuizActive ? 'オン' : 'オフ'}${
            headerQuizActive && !personalAiSongQuizEnabled && !viewerIsGuest ? '（自分オフ）' : ''
          }、おすすめ曲${headerRecommendActive ? 'オン' : 'オフ'}${
            headerRecommendActive && !personalAiRecommendEnabled && !viewerIsGuest
              ? '（自分オフ）'
              : ''
          }、AIキャラクター参加${ownerAiCharacterJoinEnabled ? 'オン' : 'オフ'}${
            guestSelectionAiHeaderOff ? '（ゲストのみのため選曲付随AIはオフ表示）' : ''
          }`}
        >
          <OwnerRoomFeatureHeaderPill
            active={ownerAiCommentaryEnabled}
            forceInactive={guestSelectionAiHeaderOff}
            inactiveTitle={guestSelectionAiHeaderTitle}
            variant="commentary"
            personalSelfOff={!viewerIsGuest && !personalAiCommentaryEnabled}
            label={
              <>
                AI曲解説
                {headerCommentaryActive && ownerCommentarySlotSuffix
                  ? ` ${ownerCommentarySlotSuffix}`
                  : ''}
              </>
            }
          />
          <OwnerRoomFeatureHeaderPill
            active={ownerSongQuizEnabled}
            forceInactive={guestSelectionAiHeaderOff}
            inactiveTitle={guestSelectionAiHeaderTitle}
            variant="quiz"
            personalSelfOff={!viewerIsGuest && !personalAiSongQuizEnabled}
            label="曲クイズ"
          />
          <OwnerRoomFeatureHeaderPill
            active={ownerNextSongRecommendEnabled}
            forceInactive={guestSelectionAiHeaderOff}
            inactiveTitle={guestSelectionAiHeaderTitle}
            variant="recommend"
            personalSelfOff={!viewerIsGuest && !personalAiRecommendEnabled}
            label="おすすめ曲"
          />
          <OwnerRoomFeatureHeaderPill
            active={ownerAiCharacterJoinEnabled}
            variant="character"
            label="AI参加"
          />
          {jpAiUnlockEnabled ? (
            <span className="shrink-0 rounded border border-emerald-600/70 bg-emerald-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
              邦楽解禁
            </span>
          ) : null}
          {!viewerIsGuest ? (
            <AiTrialStatusBadge
              status={aiTrialStatus}
              loading={aiTrialLoading}
              variant="header"
            />
          ) : null}
          {!viewerIsGuest && onAiSettingsClick ? (
            <button
              type="button"
              onClick={onAiSettingsClick}
              className="shrink-0 rounded border border-violet-500/65 bg-violet-900/35 px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-tight text-violet-200 hover:bg-violet-900/55"
              aria-label="AI 設定（選曲時の AI と @ 質問向け趣向）"
              title="選曲時の AI（解説・クイズ・おすすめ）と @ 質問向けの趣向メモ。部屋上限はオーナー向けタブ"
            >
              AI設定
            </button>
          ) : null}
        </div>
        ) : null}
        {isLg ? (
          <div className="ml-auto inline-flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {onChatSummaryClick ? (
              <button
                type="button"
                onClick={onChatSummaryClick}
                className={`text-[11px] underline decoration-dotted underline-offset-2 ${
                  IS_MC_PRODUCT
                    ? 'text-gray-600 hover:text-gray-900'
                    : 'text-cyan-300/90 hover:text-cyan-200'
                }`}
                aria-label="チャットサマリーを表示"
                title="ここまでの流れ"
              >
                チャットサマリー
              </button>
            ) : null}
            {!IS_MC_PRODUCT ? (
            <button
              type="button"
              onClick={() => {
                setAiHelpModalTab('question');
                setAiHelpModalOpen(true);
              }}
              className="inline-flex items-center gap-1 text-xs text-amber-200/90 hover:text-amber-100"
              aria-haspopup="dialog"
              aria-expanded={aiHelpModalOpen}
              aria-label="AIに質問する方法とAIのコメントについて（案内を表示）"
              title="AIに質問・AIのコメントについて"
            >
              <AtSymbolIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="underline decoration-dotted underline-offset-2">AIに質問…</span>
            </button>
            ) : null}
          </div>
        ) : (
          <div ref={chatHeaderMoreRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setChatHeaderMoreOpen((o) => !o)}
              className={chatHeaderIconBtnClass()}
              aria-haspopup="menu"
              aria-expanded={chatHeaderMoreOpen}
              aria-label="チャットサマリー・AI質問メニュー"
              title="その他"
            >
              <ChevronDownIcon className="h-4 w-4" aria-hidden />
            </button>
            {chatHeaderMoreOpen ? (
              <div
                className={`absolute right-0 top-full z-30 mt-1 min-w-[11rem] rounded-md border py-1 shadow-lg ${
                  IS_MC_PRODUCT ? 'border-gray-200 bg-white' : 'border-gray-600 bg-gray-900'
                }`}
                role="menu"
              >
                {onChatSummaryClick ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setChatHeaderMoreOpen(false);
                      onChatSummaryClick();
                    }}
                    className={`block w-full px-3 py-2 text-left text-[11px] hover:bg-gray-100 ${
                      IS_MC_PRODUCT ? 'text-gray-700' : 'text-cyan-300 hover:bg-gray-800'
                    }`}
                  >
                    チャットサマリー
                  </button>
                ) : null}
                {!IS_MC_PRODUCT ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setChatHeaderMoreOpen(false);
                    setAiHelpModalTab('question');
                    setAiHelpModalOpen(true);
                  }}
                  className="inline-flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-amber-200 hover:bg-gray-800"
                >
                  <AtSymbolIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  AIに質問…
                </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
      {themePlaylistActiveMission ? (
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-900/45 bg-amber-950/35 px-3 py-1.5"
          role="status"
          aria-label={`お題 ${themePlaylistActiveMission.themeLabel} 進行中`}
        >
          <span className="shrink-0 rounded border border-amber-600/65 bg-amber-900/45 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100">
            お題
          </span>
          <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-amber-50">
            <span className="break-words">{themePlaylistActiveMission.themeLabel}</span>
            <span className="whitespace-nowrap text-amber-200/95">
              {' '}
              （{themePlaylistActiveMission.entryCount}/{THEME_PLAYLIST_SLOT_TARGET}）
            </span>
            <button
              type="button"
              onClick={() => setThemeMissionModalOpen(true)}
              className="ml-1.5 shrink-0 rounded border border-amber-700/50 bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100/95 hover:bg-amber-800/40 hover:text-amber-50"
              aria-haspopup="dialog"
              aria-expanded={themeMissionModalOpen}
              title="これまでに登録した曲の一覧を表示"
            >
              実施中
            </button>
          </span>
        </div>
      ) : null}
      <div ref={scrollPaneRef} className="mc-room-scroll-pane min-h-0 flex-1 overflow-y-auto p-2">
        {messages.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">
            メッセージがまだありません
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleMessages.map((m) => {
              const parsedUiLabel = extractUiLabelFromBody(m.body);
              const renderedBodyText = parsedUiLabel.text;
              const bodyTextForDisplay =
                parsedUiLabel.label != null ? renderedBodyText.replace(/^\[DB\]\s*/, '') : renderedBodyText;
              const selectorName =
                m.messageType === 'ai' ? getSelectorNameFromBody(bodyTextForDisplay) : null;
              const isSelectionAnnounce = selectorName != null;
              const isNextPromptMessage =
                m.messageType === 'ai' && renderedBodyText.includes('再生が終了したら次の選曲をどうぞ');
              const isNextSongRecommendMessage =
                m.messageType === 'ai' &&
                m.aiSource === 'next_song_recommend' &&
                m.nextSongRecommendPending !== true;
              const isThemePlaylistRoomReview =
                m.messageType === 'ai' &&
                (parsedUiLabel.label === 'お題講評' || m.aiSource === 'theme_playlist_room');
              const isCharacterChatMessage =
                m.messageType === 'ai' && m.aiSource === 'character_chat';
              /** 本文は【AIキャラ】のまま保存しつつ、バッジは参加者一覧と同じ「AI ＋表示名」表記 */
              const characterParticipantBadgeText = isCharacterChatMessage
                ? aiCharacterParticipantBadgeLabel(m.displayName)
                : null;
              const showAiCharacterBadge = characterParticipantBadgeText !== null;
              const showAiMessageBadge = Boolean(parsedUiLabel.label) || showAiCharacterBadge;
              const aiMessageBadgeLabelText =
                characterParticipantBadgeText ?? parsedUiLabel.label;
              const isAiCommentaryLabeled =
                m.messageType === 'ai' &&
                typeof parsedUiLabel.label === 'string' &&
                parsedUiLabel.label.startsWith('AI曲解説');
              const shouldAnimateAiCommentary =
                isAiCommentaryLabeled && !visibleAiCommentaryIds[m.id];
              const isYellowEmphasisAi = m.messageType === 'ai' && m.aiBodyEmphasis === 'yellow';
              const messageColor =
                m.messageType === 'user' && m.clientId
                  ? participantTextColors[m.clientId] ?? DEFAULT_MESSAGE_COLOR
                  : undefined;
              const selectionAnnounceColor =
                isSelectionAnnounce && selectorName
                  ? resolveSelectorTextColor(
                      selectorName,
                      participantsWithColor,
                      currentUserDisplayName,
                      userTextColor,
                    )
                  : undefined;
              const announceVideoId =
                typeof m.videoId === 'string' && m.videoId.trim() ? m.videoId.trim() : '';
              const agentAnnounceName = (ownerAiCharacterName || AI_CHARACTER_DEFAULT_ANNOUNCE_NAME).trim();
              const showSongOverviewRequestButton =
                isSelectionAnnounce &&
                ownerAiCharacterJoinEnabled &&
                !viewerIsGuest &&
                Boolean(onRequestSongOverview) &&
                isAgentSelectionAnnounceName(selectorName, agentAnnounceName) &&
                !m.jpDomesticSilenceForVideoId &&
                announceVideoId.length > 0 &&
                canRequestSongOverviewAtQuestion(aiTrialStatus) &&
                !hasSongCommentaryForVideo(messages, announceVideoId) &&
                !(songOverviewRequestedVideoIds?.has(announceVideoId) ?? false);
              const songOverviewButtonLabel = aiTrialStatus
                ? formatSongOverviewRequestButtonLabel(aiTrialStatus)
                : 'この曲の概要を開く（1クレジット消費）';
              const feedback = feedbackState[m.id];
              const bodyContent: ReactNode =
                m.messageType === 'ai'
                  ? m.joinPasteHintCta
                    ? (
                        <span className="whitespace-pre-wrap break-words">
                          {JOIN_PASTE_YOUTUBE_URL_HINT_INTRO}
                          または右下の
                          {onOpenLibraryFromChat ? (
                            <button
                              type="button"
                              onClick={onOpenLibraryFromChat}
                              className="mx-0.5 inline rounded border border-lime-500/60 bg-lime-900/20 px-1.5 py-0.5 text-sm font-medium text-lime-100 hover:bg-lime-900/35"
                            >
                              ライブラリ
                            </button>
                          ) : (
                            'ライブラリ'
                          )}
                          からも選曲できます。
                        </span>
                      )
                  : isSelectionAnnounce
                    ? renderSelectionAnnounceBody(
                        bodyTextForDisplay,
                        selectorName,
                        selectionAnnounceColor,
                      )
                    : isCharacterChatMessage
                      ? <span className="whitespace-pre-wrap break-words">{bodyTextForDisplay}</span>
                    : isThemePlaylistRoomReview
                      ? (
                          <span className="whitespace-pre-wrap break-words">{bodyTextForDisplay}</span>
                        )
                      : renderAiBodyWithArtistSongHighlight(bodyTextForDisplay, {
                          keyPrefix: m.id,
                          onYoutubeSearch: onYoutubeSearchFromAi,
                          nextSongRecommendPlay: (() => {
                            if (!isNextSongRecommendMessage || !onNextSongRecommendSelect) return undefined;
                            const catalog = m.nextSongRecommendCatalog;
                            if (!catalog?.watchUrl || !catalog.videoId || !catalog.inMcDb) {
                              return undefined;
                            }
                            const libraryMatchLine = formatMcDbMatchDisplayLine(catalog);
                            if (!libraryMatchLine) return undefined;
                            const parsed = parseNextSongRecommendArtistTitle(bodyTextForDisplay);
                            const recArtist = parsed?.artist ?? catalog.dbMainArtist ?? '';
                            const recTitle = parsed?.title ?? catalog.dbSongTitle ?? '';
                            return {
                              watchUrl: catalog.watchUrl,
                              videoId: catalog.videoId,
                              libraryMatchLine,
                              onSelect: () => onNextSongRecommendSelect(catalog.watchUrl),
                              onPreview: () =>
                                setNextRecPreview({
                                  videoId: catalog.videoId,
                                  artist: recArtist,
                                  title: recTitle,
                                  watchUrl: catalog.watchUrl,
                                  inMcDb: true,
                                  inMusic8: catalog.inMusic8,
                                  libraryMatchLine,
                                }),
                              ...(myListAddEnabled && onMyListAddNotice
                                ? {
                                    myListAddBusy: myListAddBusyVideoId === catalog.videoId,
                                    onAddToMyList: () =>
                                      void addNextSongRecommendToMyList({
                                        videoId: catalog.videoId,
                                        watchUrl: catalog.watchUrl,
                                        artist: recArtist,
                                        title: recTitle,
                                      }),
                                  }
                                : {}),
                            };
                          })(),
                        })
                  : bodyTextForDisplay;

              return (
              <li
                key={m.id}
                ref={isAiCommentaryLabeled ? (node) => registerAiCommentaryNode(m.id, node) : undefined}
                data-message-id={isAiCommentaryLabeled ? m.id : undefined}
                className={`rounded-lg px-3 py-2 text-sm ${
                  m.messageType === 'ai'
                    ? isNextSongRecommendMessage
                      ? IS_MC_PRODUCT
                        ? 'border border-gray-300 bg-gray-50 text-gray-800'
                        : 'border border-violet-700/70 bg-gray-950'
                      : isThemePlaylistRoomReview
                        ? IS_MC_PRODUCT
                          ? 'border border-gray-300 bg-gray-50 text-gray-800'
                          : 'border border-amber-700/55 bg-amber-950/20'
                        : IS_MC_PRODUCT
                          ? 'border border-gray-200 bg-gray-100 text-gray-800'
                          : 'border border-gray-600 bg-gray-700/80'
                    : m.messageType === 'system'
                      ? IS_MC_PRODUCT
                        ? 'border border-gray-200 bg-gray-50 text-gray-700'
                        : 'border border-amber-700/40 bg-amber-900/10 text-amber-200/90'
                      : IS_MC_PRODUCT
                        ? 'border border-gray-200 bg-gray-50 text-gray-900'
                        : 'bg-gray-800/80'
                } ${
                  shouldAnimateAiCommentary
                    ? 'opacity-0'
                    : isAiCommentaryLabeled
                      ? 'animate-ai-commentary-fade-in'
                      : ''
                } ${isNextSongRecommendMessage ? 'animate-next-recommend-fade-in' : ''}`}
              >
                {m.messageType === 'ai' ? (
                  <>
                  <div className="flex items-baseline justify-between gap-2">
                    <div
                      className={`min-w-0 flex-1 break-words ${
                        isSelectionAnnounce ? '' : 'whitespace-pre-wrap'
                      } ${
                        isYellowEmphasisAi
                          ? 'font-semibold text-yellow-300'
                          : `${isCharacterChatMessage ? 'text-amber-100/85' : isSelectionAnnounce ? '' : 'text-gray-200'} ${isSelectionAnnounce || isNextPromptMessage ? 'font-bold' : ''}`
                      }`}
                    >
                      {parsedUiLabel.label == null &&
                      !isSelectionAnnounce &&
                      !isCharacterChatMessage ? (
                        <span className="mr-2 font-medium text-gray-300">{m.displayName ?? 'ユーザー'}</span>
                      ) : null}
                      {showAiMessageBadge && aiMessageBadgeLabelText ? (
                        <span
                          className={`mr-2 inline-flex max-w-[min(16rem,52vw)] shrink-0 items-center truncate rounded border px-1.5 py-0.5 text-[10px] font-semibold ${uiLabelClassName(parsedUiLabel.label, {
                            isCharacterChat: isCharacterChatMessage,
                          })}`}
                          title={aiMessageBadgeLabelText}
                        >
                          {aiMessageBadgeLabelText}
                        </span>
                      ) : null}
                      {bodyContent}
                      <span className="ml-1 inline text-[11px] text-gray-500 sm:hidden">
                        {formatTime(m.createdAt)}
                      </span>
                      {isCharacterChatMessage ? (
                        <span className="ml-1.5 inline-flex align-middle sm:hidden">
                          <AiCharacterTtsReplayButton
                            displayBody={m.body}
                            characterTtsArtistJa={m.characterTtsArtistJa}
                          />
                        </span>
                      ) : null}
                    </div>
                    <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                      {isCharacterChatMessage ? (
                        <AiCharacterTtsReplayButton
                          displayBody={m.body}
                          characterTtsArtistJa={m.characterTtsArtistJa}
                        />
                      ) : null}
                      <span className="text-xs text-gray-500">{formatTime(m.createdAt)}</span>
                    </div>
                  </div>
                  {m.joinPasteHintCta &&
                    ownerAiCharacterJoinEnabled &&
                    onJoinPasteHintAiPick && (
                      <div className="mt-2 space-y-2 border-t border-gray-700/60 pt-2">
                        <button
                          type="button"
                          onClick={() => setSongHowtoOpen(true)}
                          className="inline-flex items-center gap-1 rounded border border-sky-700/60 bg-sky-900/25 px-2 py-1 text-xs text-sky-100 hover:bg-sky-800/40"
                          aria-haspopup="dialog"
                          aria-expanded={songHowtoOpen}
                        >
                          <MusicalNoteIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          選曲方法
                        </button>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs leading-relaxed text-gray-400">
                            AIエージェントから先に選曲しましょうか？
                          </span>
                          {joinPasteHintAiPickDoneIds.has(m.id) ? (
                            <span className="text-xs text-gray-500">選曲を依頼しました</span>
                          ) : (
                            <button
                              type="button"
                              disabled={
                                currentVideoPlaying ||
                                joinPasteHintAiPickBusyId === m.id
                              }
                              onClick={() => {
                                setJoinPasteHintAiPickBusyId(m.id);
                                void Promise.resolve(onJoinPasteHintAiPick(m.id))
                                  .then((ok) => {
                                    if (ok) {
                                      setJoinPasteHintAiPickDoneIds((prev) => {
                                        const next = new Set(prev);
                                        next.add(m.id);
                                        return next;
                                      });
                                    }
                                  })
                                  .finally(() => {
                                    setJoinPasteHintAiPickBusyId((cur) =>
                                      cur === m.id ? null : cur,
                                    );
                                  });
                              }}
                              className="rounded border border-amber-600/70 bg-amber-900/35 px-2.5 py-1 text-xs font-medium text-amber-100 hover:bg-amber-800/45 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {joinPasteHintAiPickBusyId === m.id ? '選曲中…' : 'はい'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  {showSongOverviewRequestButton && onRequestSongOverview && announceVideoId ? (
                    <div className="mt-2 border-t border-gray-700/60 pt-2">
                      <button
                        type="button"
                        disabled={songOverviewRequestBusyVideoId === announceVideoId}
                        onClick={() => {
                          setSongOverviewRequestBusyVideoId(announceVideoId);
                          void Promise.resolve(
                            onRequestSongOverview({
                              messageId: m.id,
                              videoId: announceVideoId,
                            }),
                          ).finally(() => {
                            setSongOverviewRequestBusyVideoId((cur) =>
                              cur === announceVideoId ? null : cur,
                            );
                          });
                        }}
                        className="rounded border border-sky-600/70 bg-sky-900/30 px-2.5 py-1 text-xs font-medium text-sky-100 hover:bg-sky-800/45 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {songOverviewRequestBusyVideoId === announceVideoId
                          ? '概要を取得中…'
                          : songOverviewButtonLabel}
                      </button>
                    </div>
                  ) : null}
                  </>
                ) : (
                  <>
                    <div className="mb-0.5 flex items-baseline justify-between gap-2">
                      <span
                        className={`font-medium ${
                          m.messageType !== 'user' || !messageColor || IS_MC_PRODUCT
                            ? IS_MC_PRODUCT
                              ? 'text-gray-800'
                              : 'text-gray-300'
                            : ''
                        }`}
                        style={
                          shouldApplyParticipantChatColorInline() &&
                          m.messageType === 'user' &&
                          messageColor
                            ? { color: messageColor }
                            : undefined
                        }
                      >
                        {m.displayName ?? 'ユーザー'}
                      </span>
                      <span className="hidden text-xs text-gray-500 sm:inline">
                        {formatTime(m.createdAt)}
                      </span>
                    </div>
                    <p
                      className={`whitespace-pre-wrap break-words ${
                        IS_MC_PRODUCT
                          ? 'text-gray-900'
                          : messageColor
                            ? ''
                            : 'text-gray-200'
                      } ${isSelectionAnnounce || isNextPromptMessage ? 'font-bold' : ''}`}
                      style={
                        shouldApplyParticipantChatColorInline()
                          ? m.messageType === 'user'
                            ? { color: messageColor ?? DEFAULT_MESSAGE_COLOR }
                            : isSelectionAnnounce && selectionAnnounceColor
                              ? { color: selectionAnnounceColor }
                              : undefined
                          : undefined
                      }
                    >
                      {parsedUiLabel.label ? (
                        <span
                          className={`mr-2 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${uiLabelClassName(parsedUiLabel.label)}`}
                        >
                          {parsedUiLabel.label}
                        </span>
                      ) : null}
                      {bodyContent}
                      <span className="ml-1 inline text-[11px] text-gray-500 sm:hidden">
                        {formatTime(m.createdAt)}
                      </span>
                    </p>
                    {m.messageType === 'system' &&
                      m.systemKind === 'ai_question_guard' &&
                      m.aiGuardMeta &&
                      myClientId &&
                      m.aiGuardMeta.targetClientId === myClientId &&
                      roomId?.trim() && (
                        <div className="mt-1.5">
                          {objectionAlreadySent(m.id) ? (
                            <span className="text-[11px] text-gray-500">異議申立て済み</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openObjectionModal(m)}
                              className="text-[11px] text-amber-200/45 underline decoration-dotted underline-offset-2 hover:text-amber-100/75"
                            >
                              異議
                            </button>
                          )}
                        </div>
                      )}
                    {m.messageType === 'system' && m.systemKind === 'song_quiz' && m.songQuiz && (
                      <div className="mt-2 space-y-2 rounded-md border border-cyan-800/45 bg-gray-950/50 p-2.5">
                        {m.songQuiz.theme && isValidSongQuizTheme(m.songQuiz.theme) ? (
                          <p className="text-[10px] leading-tight text-cyan-500/80">
                            出題の観点: {SONG_QUIZ_THEME_UI_LABEL[m.songQuiz.theme]}
                          </p>
                        ) : null}
                        <p className="text-sm font-medium leading-snug text-cyan-50/95">
                          {m.songQuiz.question}
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {m.songQuiz.choices.map((label, idx) => {
                            const picked = songQuizPickedIndex[m.id];
                            const hasPicked = typeof picked === 'number';
                            const correctIdx = coerceSongQuizCorrectIndex(m.songQuiz!.correctIndex);
                            const isCorrect = hasPicked && idx === correctIdx;
                            const isWrongPick = hasPicked && picked === idx && !isCorrect;
                            return (
                              <button
                                key={idx}
                                type="button"
                                disabled={hasPicked}
                                onClick={() => {
                                  setSongQuizPickedIndex((prev) => ({ ...prev, [m.id]: idx }));
                                  const vid =
                                    (typeof m.videoId === 'string' && m.videoId.trim()
                                      ? m.videoId.trim()
                                      : '') ||
                                    (typeof currentVideoId === 'string' && currentVideoId.trim()
                                      ? currentVideoId.trim()
                                      : '');
                                  onSongQuizPick?.(m.id, vid, idx);
                                }}
                                className={`rounded px-2.5 py-1.5 text-left text-xs transition-colors disabled:cursor-default sm:text-sm ${
                                  hasPicked
                                    ? isCorrect
                                      ? 'border border-emerald-600/70 bg-emerald-950/40 text-emerald-100'
                                      : isWrongPick
                                        ? 'border border-rose-700/50 bg-rose-950/30 text-rose-100/90'
                                        : 'border border-gray-600/40 bg-gray-800/50 text-gray-400'
                                    : 'border border-gray-600 bg-gray-800/90 text-gray-100 hover:border-cyan-700/60 hover:bg-gray-800'
                                }`}
                              >
                                {idx + 1}. {label}
                              </button>
                            );
                          })}
                        </div>
                        {typeof songQuizPickedIndex[m.id] === 'number' && m.songQuiz
                          ? (() => {
                              const pickedN = songQuizPickedIndex[m.id]!;
                              const sq = m.songQuiz;
                              const cIdx = coerceSongQuizCorrectIndex(sq.correctIndex);
                              const cLabel = sq.choices[cIdx]?.trim() ?? '';
                              const isHit = pickedN === cIdx;
                              return (
                                <div className="space-y-2">
                                  <div className="rounded-md border border-emerald-700/55 bg-emerald-950/35 px-2.5 py-2">
                                    <p className="text-[11px] font-semibold tracking-wide text-emerald-200/90">
                                      正解発表
                                    </p>
                                    <p className="mt-1 text-sm font-medium leading-snug text-emerald-50">
                                      正解は {cIdx + 1} 番{cLabel ? `「${cLabel}」` : ''}です。
                                    </p>
                                    <p className="mt-1 text-xs leading-snug text-emerald-100/85">
                                      {isHit
                                        ? 'お見事、正解です。'
                                        : `あなたの回答は ${pickedN + 1} 番でした。`}
                                    </p>
                                  </div>
                                  <p className="text-xs leading-relaxed text-gray-300">{sq.explanation}</p>
                                </div>
                              );
                            })()
                          : null}
                        {!IS_MC_PRODUCT ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-cyan-900/40 pt-2 text-xs">
                          <button
                            type="button"
                            className={`flex items-center justify-center rounded border px-1.5 py-0.5 ${
                              feedback === 'up'
                                ? 'border-emerald-400 text-emerald-300'
                                : 'border-gray-500 text-gray-400 hover:bg-gray-800'
                            }`}
                            onClick={() => sendFeedback(m, true)}
                            title="出題が良い"
                            aria-label="出題へのいいね"
                          >
                            <HandThumbUpIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={`flex items-center justify-center rounded border px-1.5 py-0.5 ${
                              feedback === 'down'
                                ? 'border-rose-400 text-rose-300'
                                : 'border-gray-500 text-gray-400 hover:bg-gray-800'
                            }`}
                            onClick={() => sendFeedback(m, false)}
                            title="出題が良くない"
                            aria-label="出題へのよくない評価"
                          >
                            <HandThumbDownIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="flex items-center justify-center rounded border border-gray-500 px-1.5 py-0.5 text-gray-400 hover:bg-gray-800"
                            onClick={() => openFeedbackModal(m)}
                            title="出題の詳細フィードバック"
                            aria-label="出題の詳細フィードバック"
                          >
                            <ChatBubbleLeftRightIcon className="h-4 w-4" />
                          </button>
                        </div>
                        ) : null}
                      </div>
                    )}
                    {chatModeratorToolsEnabled && roomId?.trim() && (
                      <div className="mt-1.5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => openTuningReportModal(m)}
                          className="text-[10px] text-cyan-400/85 underline decoration-dotted underline-offset-2 hover:text-cyan-300"
                          title="AI_TIDBIT_MODERATOR のみ。前後の会話を DB に保存してプロンプト等の調整に使います。"
                        >
                          DBに報告（チューニング）
                        </button>
                      </div>
                    )}
                  </>
                )}
                {m.searchQuery && (
                  <a
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(m.searchQuery)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                  >
                    YouTubeで「{m.searchQuery}」を検索
                  </a>
                )}
                {m.messageType === 'ai' &&
                  !IS_MC_PRODUCT &&
                  ((renderedBodyText.startsWith('[NEW]') || renderedBodyText.startsWith('[DB]')) ||
                    (m.aiSource === 'next_song_recommend' && m.nextSongRecommendPending !== true)) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                    <button
                      type="button"
                      className={`flex items-center justify-center rounded border px-1.5 py-0.5 ${
                        feedback === 'up'
                          ? 'border-emerald-400 text-emerald-300'
                          : 'border-gray-500 text-gray-400 hover:bg-gray-800'
                      }`}
                      onClick={() => sendFeedback(m, true)}
                    >
                      <HandThumbUpIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={`flex items-center justify-center rounded border px-1.5 py-0.5 ${
                        feedback === 'down'
                          ? 'border-rose-400 text-rose-300'
                          : 'border-gray-500 text-gray-400 hover:bg-gray-800'
                      }`}
                      onClick={() => sendFeedback(m, false)}
                    >
                      <HandThumbDownIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="flex items-center justify-center rounded border border-gray-500 px-1.5 py-0.5 text-gray-400 hover:bg-gray-800"
                      onClick={() => openFeedbackModal(m)}
                      title="詳細フィードバック"
                    >
                      <ChatBubbleLeftRightIcon className="h-4 w-4" />
                    </button>
                    {chatModeratorToolsEnabled &&
                      onTidbitLibraryReject &&
                      m.tidbitId &&
                      !m.tidbitLibraryRejected && (
                        <button
                          type="button"
                          disabled={tidbitRejectingId === m.id}
                          className="rounded border border-amber-700/80 bg-amber-950/40 px-2 py-0.5 font-medium text-amber-200/95 hover:bg-amber-900/50 disabled:opacity-50"
                          title="この1件を song_tidbits から無効化（再利用されません）"
                          onClick={async () => {
                            if (!m.tidbitId) return;
                            setTidbitRejectingId(m.id);
                            try {
                              await onTidbitLibraryReject(m.id, m.tidbitId);
                            } finally {
                              setTidbitRejectingId((cur) => (cur === m.id ? null : cur));
                            }
                          }}
                        >
                          {tidbitRejectingId === m.id ? '処理中…' : 'NG（DBから外す）'}
                        </button>
                      )}
                    {m.tidbitLibraryRejected && (
                      <span className="text-amber-200/80">※ライブラリから削除済</span>
                    )}
                    {chatModeratorToolsEnabled &&
                      onNextSongRecommendReject &&
                      m.aiSource === 'next_song_recommend' &&
                      m.recommendationId && (
                        <button
                          type="button"
                          disabled={nextSongRecRejectingId === m.id}
                          className="rounded border border-amber-700/80 bg-amber-950/40 px-2 py-0.5 font-medium text-amber-200/95 hover:bg-amber-900/50 disabled:opacity-50"
                          title="このおすすめを next_song_recommendations から無効化"
                          onClick={async () => {
                            if (!m.recommendationId) return;
                            setNextSongRecRejectingId(m.id);
                            try {
                              await onNextSongRecommendReject(m.id, m.recommendationId);
                            } finally {
                              setNextSongRecRejectingId((cur) => (cur === m.id ? null : cur));
                            }
                          }}
                        >
                          {nextSongRecRejectingId === m.id ? '処理中…' : 'NG（おすすめをDBから外す）'}
                        </button>
                      )}
                    {chatModeratorToolsEnabled && roomId?.trim() && (
                      <button
                        type="button"
                        onClick={() => openTuningReportModal(m)}
                        className="rounded border border-cyan-800/70 bg-cyan-950/35 px-2 py-0.5 text-[10px] font-medium text-cyan-200/90 hover:bg-cyan-900/45"
                        title="モデレーター専用: 前後の会話を DB に報告"
                      >
                        DB報告
                      </button>
                    )}
                  </div>
                )}
                {m.messageType === 'ai' &&
                  chatStyleAdminEnabled &&
                  canSaveArtistTitleMeta(m) && (
                    <div className="mt-1">
                      <button
                        type="button"
                        disabled={artistTitleReportingId === m.id}
                        className="rounded border border-amber-700/80 bg-amber-950/40 px-2 py-0.5 text-[11px] font-medium text-amber-200/95 hover:bg-amber-900/50 disabled:opacity-50"
                        title="oEmbed・snippet・resolve 結果を DB に保存（開発検証用）"
                        onClick={() => void submitArtistTitleReport(m)}
                      >
                        {artistTitleReportingId === m.id
                          ? '保存中…'
                          : '表記メタを記録（STYLE_ADMIN）'}
                      </button>
                    </div>
                  )}
                {m.messageType === 'ai' &&
                  chatModeratorToolsEnabled &&
                  roomId?.trim() &&
                  !(renderedBodyText.startsWith('[NEW]') || renderedBodyText.startsWith('[DB]')) && (
                    <div className="mt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => openTuningReportModal(m)}
                        className="text-[10px] text-cyan-400/85 underline decoration-dotted underline-offset-2 hover:text-cyan-300"
                      >
                        DBに報告（チューニング）
                      </button>
                    </div>
                  )}
              </li>
              );
            })}
          </ul>
        )}
        {deferredNextSongRecommendMessages.length > 0 ? (
          <details className="mt-3 rounded-md border border-violet-700/55 bg-violet-950/15 p-2">
            <summary className="cursor-pointer list-none text-xs font-semibold text-violet-200">
              あとで見るおすすめ曲 ({deferredNextSongRecommendMessages.length})
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {deferredNextSongRecommendMessages.map((m) => (
                <li
                  key={`deferred-${m.id}`}
                  className="rounded border border-violet-700/50 bg-gray-950 px-2.5 py-2 text-xs text-gray-200"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-violet-200">遅延表示</span>
                    <span className="text-[10px] text-gray-500">{formatTime(m.createdAt)}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words">
                    {renderAiBodyWithArtistSongHighlight(stripUiLabelPrefix(m.body), {
                      keyPrefix: `deferred-${m.id}`,
                      onYoutubeSearch: onYoutubeSearchFromAi,
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <div ref={bottomRef} aria-hidden />
      </div>

      {/* 詳細フィードバック用モーダル */}
      {feedbackModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-modal-title"
        >
          <div
            className="w-full max-w-md rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {feedbackModal.done ? (
              <>
                <p id="feedback-modal-title" className="mb-4 text-sm text-gray-200">
                  {isSongQuizFeedbackTarget(feedbackModal.message)
                    ? '三択クイズの出題について、貴重なご意見ありがとうございました。'
                    : 'AIに対するご評価、貴重なご意見ありがとうございました。'}
                </p>
                {feedbackModal.emailSent === false && (
                  <p className="mb-4 text-xs text-amber-200/90">
                    {feedbackModal.emailFailCode === 'missing_api_key'
                      ? '通知メールは送信されませんでした。サーバーに RESEND_API_KEY が設定されていません。プロジェクト直下の .env.local に記載し、開発サーバーを再起動してください。本番（Vercel 等）ではホスト側の環境変数にも設定が必要です。'
                      : '通知メールは送信されませんでした（Resend 側のエラー、送信元ドメイン未検証、迷惑メール判定などの可能性があります）。サーバーログを確認してください。'}
                    <span className="mt-1 block text-gray-400">
                      フィードバック自体はデータベースに保存されています。
                    </span>
                  </p>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="rounded border border-gray-500 bg-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                    onClick={closeFeedbackModal}
                  >
                    閉じる
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 id="feedback-modal-title" className="mb-3 text-sm font-medium text-gray-200">
                  詳細フィードバック
                </h3>
                {isSongQuizFeedbackTarget(feedbackModal.message) ? (
                  <p className="mb-3 text-xs leading-relaxed text-gray-400">
                    問題文・選択肢・解説のバランスや難易度など、出題内容についてお知らせください。
                  </p>
                ) : null}
                <div className="mb-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={detailChecks.duplicate}
                      onChange={(e) => setDetailChecks((c) => ({ ...c, duplicate: e.target.checked }))}
                      className="rounded border-gray-500"
                    />
                    {isSongQuizFeedbackTarget(feedbackModal.message)
                      ? '出題内容が重複・似た問題が続く'
                      : 'コメント内容が重複'}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={detailChecks.dubious}
                      onChange={(e) => setDetailChecks((c) => ({ ...c, dubious: e.target.checked }))}
                      className="rounded border-gray-500"
                    />
                    {isSongQuizFeedbackTarget(feedbackModal.message)
                      ? '出題の根拠・事実関係が怪しい'
                      : 'コメント内容の真偽が怪しい'}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={detailChecks.ambiguous}
                      onChange={(e) => setDetailChecks((c) => ({ ...c, ambiguous: e.target.checked }))}
                      className="rounded border-gray-500"
                    />
                    {isSongQuizFeedbackTarget(feedbackModal.message)
                      ? '出題が曖昧・ありきたりで物足りない'
                      : 'コメント内容が曖昧、間違いではないが、ありきたり'}
                  </label>
                </div>
                <div className="mb-3">
                  <label htmlFor="feedback-free-comment" className="mb-1 block text-xs text-gray-400">
                    自由コメント
                  </label>
                  <textarea
                    id="feedback-free-comment"
                    value={detailComment}
                    onChange={(e) => setDetailComment(e.target.value)}
                    placeholder="任意でご記入ください"
                    rows={3}
                    className="w-full rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded border border-gray-500 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
                    onClick={closeFeedbackModal}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                    onClick={sendDetailFeedback}
                    disabled={feedbackModal.sending}
                  >
                    {feedbackModal.sending ? '送信中…' : '送信'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* AI 質問ガード警告への異議申立て */}
      {objectionModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="objection-modal-title"
        >
          <div
            className="max-h-[min(88vh,32rem)] w-full max-w-md overflow-y-auto rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {objectionModal.done ? (
              <>
                <p id="objection-modal-title" className="mb-3 text-sm text-gray-200">
                  異議申立てを受け付けました。運営で内容を確認し、AI の判定改善に活用します。
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="rounded border border-gray-500 bg-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                    onClick={closeObjectionModal}
                  >
                    閉じる
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 id="objection-modal-title" className="mb-2 text-sm font-medium text-gray-200">
                  システム警告への異議申立て
                </h3>
                <p className="mb-3 text-xs leading-relaxed text-gray-400">
                  「@」付きの質問が音楽に関係ないと判断されたことへの異議です。よくある理由にチェックを入れ、必要ならコメントを書いて送信してください。送信内容は前後の会話とあわせてデータベースに保存され、運営が確認して
                  AI の改善に役立てます。
                </p>
                {objectionModal.errorText ? (
                  <p className="mb-2 text-xs text-rose-300">{objectionModal.errorText}</p>
                ) : null}
                <div className="mb-3 space-y-2">
                  {AI_GUARD_OBJECTION_REASON_OPTIONS.map((o) => (
                    <label key={o.id} className="flex items-start gap-2 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        checked={objectionReasons[o.id] ?? false}
                        onChange={(e) =>
                          setObjectionReasons((c) => ({ ...c, [o.id]: e.target.checked }))
                        }
                        className="mt-0.5 rounded border-gray-500"
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
                <div className="mb-3">
                  <label htmlFor="objection-comment" className="mb-1 block text-xs text-gray-400">
                    コメント（任意）
                  </label>
                  <textarea
                    id="objection-comment"
                    value={objectionComment}
                    onChange={(e) => setObjectionComment(e.target.value)}
                    placeholder="補足があればご記入ください"
                    rows={3}
                    className="w-full rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded border border-gray-500 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
                    onClick={closeObjectionModal}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    className="rounded bg-amber-700/90 px-3 py-1.5 text-sm text-white hover:bg-amber-600 disabled:opacity-50"
                    onClick={sendObjection}
                    disabled={objectionModal.sending}
                  >
                    {objectionModal.sending ? '送信中…' : '送信'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* AI チューニング報告（AI_TIDBIT_MODERATOR のみ API で許可） */}
      {tuningReportModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tuning-report-modal-title"
        >
          <div
            className="max-h-[min(88vh,36rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {tuningReportModal.done ? (
              <>
                <p id="tuning-report-modal-title" className="mb-3 text-sm text-gray-200">
                  報告を保存しました。プロンプト・ポリシーの調整に参照します。
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="rounded border border-gray-500 bg-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                    onClick={closeTuningReportModal}
                  >
                    閉じる
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 id="tuning-report-modal-title" className="mb-2 text-sm font-medium text-cyan-100">
                  会話を DB に報告（チューニング用）
                </h3>
                <p className="mb-3 text-xs leading-relaxed text-gray-400">
                  基準メッセージの前後（最大約{' '}
                  {CHAT_CONVERSATION_SNAPSHOT_BEFORE + CHAT_CONVERSATION_SNAPSHOT_AFTER + 1}
                  件分）がスナップショットとして保存されます。修正したい点・検討したい観点をメモに書いて送信してください。（モデレーター専用）
                </p>
                {tuningReportModal.errorText ? (
                  <p className="mb-2 text-xs text-rose-300">{tuningReportModal.errorText}</p>
                ) : null}
                <div className="mb-2 rounded border border-gray-600 bg-gray-900/60 p-2 text-[11px] text-gray-400">
                  <span className="font-medium text-gray-300">基準: </span>
                  <span className="text-gray-500">
                    [{tuningReportModal.message.messageType}] {tuningReportModal.message.displayName ?? ''}:{' '}
                  </span>
                  <span className="whitespace-pre-wrap text-gray-400">
                    {(() => {
                      const preview = tuningReportAnchorPreviewBody(tuningReportModal.message);
                      const max = 400;
                      return (
                        <>
                          {preview.slice(0, max)}
                          {preview.length > max ? '…' : ''}
                        </>
                      );
                    })()}
                  </span>
                </div>
                <div className="mb-3">
                  <label htmlFor="tuning-report-note" className="mb-1 block text-xs text-gray-400">
                    メモ（必須）
                  </label>
                  <textarea
                    id="tuning-report-note"
                    value={tuningReportNote}
                    onChange={(e) => setTuningReportNote(e.target.value)}
                    placeholder="例: この @ 発言は音楽関連だが弾かれた／この AI 返答は根拠が弱い／プロンプトでこう誘導したい など"
                    rows={5}
                    className="w-full rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded border border-gray-500 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
                    onClick={closeTuningReportModal}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    className="rounded bg-cyan-700/90 px-3 py-1.5 text-sm text-white hover:bg-cyan-600 disabled:opacity-50"
                    onClick={() => void sendTuningReport()}
                    disabled={tuningReportModal.sending}
                  >
                    {tuningReportModal.sending ? '送信中…' : 'DB に保存'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {aiHelpModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="AIに関する案内"
        >
          <div
            className="flex max-h-[min(80vh,28rem)] w-full max-w-md flex-col overflow-hidden rounded-lg border border-gray-600 bg-gray-900 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-gray-700 px-4 pb-0 pt-4">
              <div
                className="flex gap-1 border-b border-gray-700/80"
                role="tablist"
                aria-label="案内の切替"
              >
                <button
                  type="button"
                  role="tab"
                  id="ai-help-tab-question"
                  aria-selected={aiHelpModalTab === 'question'}
                  aria-controls="ai-help-panel-question"
                  className={`relative -mb-px shrink-0 rounded-t px-3 py-2 text-xs font-medium transition-colors ${
                    aiHelpModalTab === 'question'
                      ? 'border-b-2 border-amber-400 text-amber-100'
                      : 'border-b-2 border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                  onClick={() => setAiHelpModalTab('question')}
                >
                  AIに質問
                </button>
                <button
                  type="button"
                  role="tab"
                  id="ai-help-tab-comments"
                  aria-selected={aiHelpModalTab === 'comments'}
                  aria-controls="ai-help-panel-comments"
                  className={`relative -mb-px shrink-0 rounded-t px-3 py-2 text-xs font-medium transition-colors ${
                    aiHelpModalTab === 'comments'
                      ? 'border-b-2 border-amber-400 text-amber-100'
                      : 'border-b-2 border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                  onClick={() => setAiHelpModalTab('comments')}
                >
                  AIのコメント
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-3">
              {aiHelpModalTab === 'question' ? (
                <div
                  id="ai-help-panel-question"
                  role="tabpanel"
                  aria-labelledby="ai-help-tab-question"
                >
                  <p className="whitespace-pre-line text-sm leading-relaxed text-gray-300">
                    {getAiConversationGuideQuestionTabForModal()}
                  </p>
                  <p className="mt-3 text-sm">
                    <Link
                      href={guideAiHref}
                      className="text-amber-200/90 underline underline-offset-2 hover:text-amber-100"
                    >
                      ご利用上の注意（AIについて）を開く
                    </Link>
                  </p>
                </div>
              ) : (
                <div
                  id="ai-help-panel-comments"
                  role="tabpanel"
                  aria-labelledby="ai-help-tab-comments"
                >
                  <p className="whitespace-pre-line text-sm leading-relaxed text-gray-300">
                    {getAiChatDisclaimerCommentsTabForDisplay()}
                  </p>
                </div>
              )}
            </div>
            <div className="shrink-0 space-y-3 border-t border-gray-700 p-4 pt-3">
              <button
                type="button"
                className="text-left text-sm text-amber-200/90 underline decoration-dotted underline-offset-2 hover:text-amber-100"
                onClick={() => {
                  setAiHelpModalOpen(false);
                  setAiQuestionExamplesOpen(true);
                }}
              >
                AI質問例を見る
              </button>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                  onClick={() => setAiHelpModalOpen(false)}
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {themePlaylistActiveMission && themeMissionModalOpen ? (
        <ThemePlaylistMissionEntriesModal
          open
          onClose={() => setThemeMissionModalOpen(false)}
          themeId={themePlaylistActiveMission.themeId}
          themeLabel={themePlaylistActiveMission.themeLabel}
          room={themePlaylistMissionRoom}
        />
      ) : null}

      {nextRecPreview ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="next-rec-preview-title"
        >
          <div
            className="flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-violet-700/60 bg-gray-950 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-gray-800 px-4 py-3">
              <div className="min-w-0">
                <h2 id="next-rec-preview-title" className="text-sm font-semibold text-white">
                  おすすめ曲プレビュー
                </h2>
                <p className="mt-0.5 truncate text-xs text-gray-400">{nextRecPreview.libraryMatchLine}</p>
                <p className="mt-1 text-[10px] text-violet-300/90">
                  部屋で再生中の曲の音はミュートしています
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
                onClick={() => setNextRecPreview(null)}
              >
                閉じる
              </button>
            </div>
            <div className="aspect-video w-full shrink-0 bg-black">
              <iframe
                title="おすすめ曲プレビュー"
                src={`https://www.youtube.com/embed/${encodeURIComponent(nextRecPreview.videoId)}?autoplay=1&controls=1&modestbranding=1`}
                className="h-full w-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-gray-800 p-3">
              {onNextSongRecommendSelect ? (
                <button
                  type="button"
                  className="h-10 flex-1 rounded border border-lime-500/70 bg-lime-900/40 px-3 text-sm font-semibold text-lime-100 hover:bg-lime-900/70"
                  onClick={() => {
                    onNextSongRecommendSelect(nextRecPreview.watchUrl);
                    setNextRecPreview(null);
                  }}
                >
                  この曲を選曲
                </button>
              ) : null}
              {myListAddEnabled && onMyListAddNotice ? (
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded border border-violet-600/60 bg-violet-900/40 px-3 text-sm font-semibold text-violet-100 hover:bg-violet-900/60 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={myListAddBusyVideoId === nextRecPreview.videoId}
                  onClick={() =>
                    void addNextSongRecommendToMyList({
                      videoId: nextRecPreview.videoId,
                      watchUrl: nextRecPreview.watchUrl,
                      artist: nextRecPreview.artist,
                      title: nextRecPreview.title,
                    })
                  }
                >
                  {myListAddBusyVideoId === nextRecPreview.videoId ? '追加中…' : 'マイリスト追加'}
                </button>
              ) : null}
              <a
                href={nextRecPreview.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center rounded border border-gray-600 bg-gray-800 px-3 text-sm text-gray-100 hover:bg-gray-700"
              >
                YouTube で開く
              </a>
            </div>
          </div>
        </div>
      ) : null}
      {aiQuestionExamplesOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-ai-question-examples-title"
        >
          <div
            className="max-h-[min(80vh,28rem)] w-full max-w-md overflow-y-auto rounded-lg border border-gray-600 bg-gray-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="chat-ai-question-examples-title" className="mb-3 text-sm font-semibold text-white">
              AIへの質問例
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-gray-300">
              文頭に <span className="text-gray-200">@</span> を付けて送信してください。
            </p>
            <ul className="space-y-2">
              {aiQuestionExamples.map((example) => (
                <li key={example.question} className="rounded border border-gray-700 bg-gray-800/60 p-2">
                  <details className="group">
                    <summary className="cursor-pointer list-none break-words text-sm leading-relaxed text-gray-100">
                      <span className="inline-flex items-center gap-2">
                        <span>{example.question}</span>
                        <span className="text-xs text-gray-400 group-open:hidden">回答を表示</span>
                        <span className="hidden text-xs text-gray-400 group-open:inline">回答を閉じる</span>
                      </span>
                    </summary>
                    <p className="mt-2 whitespace-pre-line rounded border border-gray-700 bg-gray-900/60 p-2 text-sm leading-relaxed text-gray-300">
                      {example.answer}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                onClick={() => setAiQuestionExamplesOpen(false)}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
      <SongSelectionHowtoModal open={songHowtoOpen} onClose={() => setSongHowtoOpen(false)} />
    </div>
  );
}
