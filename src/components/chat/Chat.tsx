'use client';

/**
 * チャット表示エリア（メッセージ一覧・末尾へスクロール）
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getSafeInternalReturnPath } from '@/lib/safe-return-path';
import {
  HandThumbUpIcon,
  HandThumbDownIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import type { ChatMessage as ChatMessageType } from '@/types/chat';
import { AI_CHAT_DISCLAIMER } from '@/lib/chat-system-copy';
import { AI_GUARD_OBJECTION_REASON_OPTIONS } from '@/lib/ai-guard-objection';

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

const OBJECTION_SNAPSHOT_BEFORE = 18;
const OBJECTION_SNAPSHOT_AFTER = 4;

function buildAiGuardObjectionSnapshot(
  allMessages: ChatMessageType[],
  systemMessageId: string,
): { displayName?: string; messageType: string; body: string; createdAt: string }[] {
  const idx = allMessages.findIndex((m) => m.id === systemMessageId);
  if (idx < 0) return [];
  const start = Math.max(0, idx - OBJECTION_SNAPSHOT_BEFORE);
  const end = Math.min(allMessages.length, idx + OBJECTION_SNAPSHOT_AFTER + 1);
  let slice = allMessages.slice(start, end);
  if (slice.length > 40) {
    slice = slice.slice(-40);
  }
  return slice.map((m) => ({
    displayName: m.displayName,
    messageType: m.messageType,
    body: m.body,
    createdAt: m.createdAt,
  }));
}

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
  /** song_tidbits をライブラリから外す NG（最高管理者のみ） */
  canRejectTidbit?: boolean;
  onTidbitLibraryReject?: (messageId: string, tidbitId: string) => void | Promise<void>;
  /** 途中参加向けチャットサマリーを開く */
  onChatSummaryClick?: () => void;
  /** オーナー設定: 邦楽AI解説を解禁中ならヘッダーに表示 */
  jpAiUnlockEnabled?: boolean;
  /** 部屋ID（異議申立てAPI用） */
  roomId?: string;
  /** 自分の Ably clientId（ガード警告の対象者のみ異議ボタンを出す） */
  myClientId?: string;
  /** STYLE_ADMIN のみ true（表記メタ記録ボタン） */
  styleAdminChatTools?: boolean;
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
  const match = body.match(/^(.+?)さんの選曲です！/);
  return match ? match[1].trim() : null;
}

const DEFAULT_MESSAGE_COLOR = '#e5e7eb';

/** AI 曲解説・comment-pack：固有名っぽい箇所を黄色（[NEW]・接続の「の」・括弧の外側は本文色） */
const AI_ARTIST_SONG_HIGHLIGHT_CLASS = 'font-semibold text-yellow-300';

const PACK_PREFIX_RE = /^(\[(?:NEW|DB)\]\s*)/;
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
  if (kept.length === 0) return [rest];
  const out: ReactNode[] = [];
  let last = 0;
  for (const s of kept) {
    if (s.start > last) out.push(rest.slice(last, s.start));
    out.push(...s.nodes);
    last = s.end;
  }
  if (last < rest.length) out.push(rest.slice(last));
  return out;
}

function renderAiBodyWithArtistSongHighlight(body: string): ReactNode {
  const pm = body.match(PACK_PREFIX_RE);
  const prefix = pm?.[1] ?? '';
  const rest = pm ? body.slice(pm[0].length) : body;

  let k = 0;
  const key = () => `ai-hl-${k++}`;

  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const primary = new RegExp(ARTIST_NO_TITLE_RE.source, ARTIST_NO_TITLE_RE.flags);
  while ((m = primary.exec(rest)) !== null) {
    if (m.index > last) {
      out.push(...highlightPlainSegment(rest.slice(last, m.index), key));
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

  if (last < rest.length) {
    out.push(...highlightPlainSegment(rest.slice(last), key));
  }

  if (!prefix && out.length === 0) return body;
  if (!prefix && out.length === 1 && typeof out[0] === 'string') return out[0] as string;

  return (
    <>
      {prefix}
      {out.length > 0 ? out : rest}
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
  canRejectTidbit = false,
  onTidbitLibraryReject,
  onChatSummaryClick,
  jpAiUnlockEnabled = false,
  roomId,
  myClientId,
  styleAdminChatTools = false,
}: ChatProps) {
  const pathname = usePathname();
  const pathSegs = pathname?.split('/').filter(Boolean) ?? [];
  const roomPathSegment = pathSegs.length === 1 ? pathSegs[0] : null;
  const guideAiHref =
    roomPathSegment && getSafeInternalReturnPath(roomPathSegment)
      ? `/guide/ai?returnTo=${encodeURIComponent(roomPathSegment)}`
      : '/guide/ai';

  const bottomRef = useRef<HTMLDivElement>(null);
  const [feedbackState, setFeedbackState] = useState<Record<string, 'up' | 'down'>>({});
  const [feedbackModal, setFeedbackModal] = useState<FeedbackModalState>({ open: false });
  const [objectionModal, setObjectionModal] = useState<ObjectionModalState>({ open: false });
  const [objectionReasons, setObjectionReasons] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(AI_GUARD_OBJECTION_REASON_OPTIONS.map((o) => [o.id, false])),
  );
  const [objectionComment, setObjectionComment] = useState('');
  const [detailChecks, setDetailChecks] = useState({ duplicate: false, dubious: false, ambiguous: false });
  const [detailComment, setDetailComment] = useState('');
  const [tidbitRejectingId, setTidbitRejectingId] = useState<string | null>(null);
  const [artistTitleReportingId, setArtistTitleReportingId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function sendFeedback(message: ChatMessageType, isUpvote: boolean) {
    if (message.messageType !== 'ai') return;
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
    fetch('/api/comment-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: message.songId ?? null,
        videoId: videoIdToSend,
        aiMessageId: message.id,
        commentBody: message.body,
        source: message.aiSource ?? 'other',
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
    if (m.body.includes('再生が終了したら次の曲をどうぞ')) return false;
    return (
      getSelectorNameFromBody(m.body) != null ||
      m.body.startsWith('[NEW]') ||
      m.body.startsWith('[DB]')
    );
  }

  function artistTitleReportMessageKind(m: ChatMessageType): 'announce_song' | 'song_commentary' {
    return getSelectorNameFromBody(m.body) != null ? 'announce_song' : 'song_commentary';
  }

  async function submitArtistTitleReport(m: ChatMessageType) {
    if (!styleAdminChatTools || !canSaveArtistTitleMeta(m)) return;
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
    const videoIdToSend =
      (typeof message.videoId === 'string' && message.videoId.trim() ? message.videoId.trim() : undefined) ??
      (typeof currentVideoId === 'string' && currentVideoId?.trim() ? currentVideoId.trim() : undefined) ??
      null;
    setFeedbackModal((prev) => (prev.open ? { ...prev, sending: true } : prev));
    try {
      const res = await fetch('/api/comment-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId: message.songId ?? null,
          videoId: videoIdToSend,
          aiMessageId: message.id,
          commentBody: message.body,
          source: message.aiSource ?? 'other',
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
    const snapshot = buildAiGuardObjectionSnapshot(messages, message.id);
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

  const [disclaimerOpen, setDisclaimerOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-700 px-3 py-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-300">
          チャット
          {jpAiUnlockEnabled ? (
            <span className="rounded border border-emerald-600/70 bg-emerald-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
              邦楽解禁
            </span>
          ) : null}
        </span>
        <div className="inline-flex items-center gap-2">
          {onChatSummaryClick ? (
            <button
              type="button"
              onClick={onChatSummaryClick}
              className="text-[11px] text-cyan-300/90 underline decoration-dotted underline-offset-2 hover:text-cyan-200"
              aria-label="チャットサマリーを表示"
              title="ここまでの流れ"
            >
              チャットサマリー
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setDisclaimerOpen(true)}
            className="inline-flex items-center gap-1 text-xs text-amber-200/90 hover:text-amber-100"
            aria-haspopup="dialog"
            aria-expanded={disclaimerOpen}
            aria-label="AIのコメントについて（注意事項を表示）"
            title="AIのコメントについて"
          >
            <ChatBubbleLeftRightIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="underline decoration-dotted underline-offset-2">AIのコメント…</span>
          </button>
        </div>
      </div>
      <div className="border-b border-gray-800/80 px-3 py-1.5">
        <p className="text-[11px] leading-snug text-gray-400">
          AIへの質問は <span className="text-gray-300">@ 質問内容</span>（音楽関連）で送信してください。詳細は
          <Link
            href={guideAiHref}
            className="text-amber-200/90 underline underline-offset-2 hover:text-amber-100"
          >
            ご利用上の注意（AIについて）
          </Link>
          。
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {messages.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">
            メッセージがまだありません
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => {
              const selectorName =
                m.messageType === 'ai' ? getSelectorNameFromBody(m.body) : null;
              const isSelectionAnnounce = selectorName != null;
              const isNextPromptMessage =
                m.messageType === 'ai' && m.body.includes('再生が終了したら次の選曲をどうぞ');
              const messageColor =
                m.messageType === 'user' && m.clientId
                  ? participantTextColors[m.clientId] ?? DEFAULT_MESSAGE_COLOR
                  : undefined;
              const selectionAnnounceColor =
                isSelectionAnnounce && selectorName
                  ? participantsWithColor.find((p) => p.displayName === selectorName)?.textColor ?? undefined
                  : undefined;
              const feedback = feedbackState[m.id];
              const bodyContent: ReactNode =
                m.messageType === 'ai'
                  ? renderAiBodyWithArtistSongHighlight(m.body)
                  : m.body;

              return (
              <li
                key={m.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  m.messageType === 'ai'
                    ? 'border border-gray-600 bg-gray-700/80'
                    : m.messageType === 'system'
                      ? 'border border-amber-700/40 bg-amber-900/10 text-amber-200/90'
                      : 'bg-gray-800/80'
                }`}
              >
                {m.messageType === 'ai' ? (
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className={`min-w-0 flex-1 break-words text-gray-200 ${isSelectionAnnounce || isNextPromptMessage ? 'font-bold' : ''}`}
                      style={
                        isSelectionAnnounce && selectionAnnounceColor
                          ? { color: selectionAnnounceColor }
                          : undefined
                      }
                    >
                      <span className="mr-2 font-medium text-gray-300">{m.displayName ?? 'ユーザー'}</span>
                      <span className="whitespace-pre-wrap">{bodyContent}</span>
                      <span className="ml-1 inline text-[11px] text-gray-500 sm:hidden">
                        {formatTime(m.createdAt)}
                      </span>
                    </p>
                    <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">
                      {formatTime(m.createdAt)}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="mb-0.5 flex items-baseline justify-between gap-2">
                      <span
                        className={`font-medium ${m.messageType !== 'user' || !messageColor ? 'text-gray-300' : ''}`}
                        style={
                          m.messageType === 'user' && messageColor
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
                      className={`whitespace-pre-wrap break-words ${messageColor ? '' : 'text-gray-200'} ${isSelectionAnnounce || isNextPromptMessage ? 'font-bold' : ''}`}
                      style={
                        m.messageType === 'user'
                          ? { color: messageColor ?? DEFAULT_MESSAGE_COLOR }
                          : isSelectionAnnounce && selectionAnnounceColor
                            ? { color: selectionAnnounceColor }
                            : undefined
                      }
                    >
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
                {m.messageType === 'ai' && (m.body.startsWith('[NEW]') || m.body.startsWith('[DB]')) && (
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
                    {canRejectTidbit &&
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
                  </div>
                )}
                {m.messageType === 'ai' &&
                  styleAdminChatTools &&
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
              </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} aria-hidden />
      </div>

      {/* 詳細フィードバック用モーダル */}
      {feedbackModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && !feedbackModal.done && closeFeedbackModal()}
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
                  AIに対するご評価、貴重なご意見ありがとうございました。
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
                <div className="mb-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={detailChecks.duplicate}
                      onChange={(e) => setDetailChecks((c) => ({ ...c, duplicate: e.target.checked }))}
                      className="rounded border-gray-500"
                    />
                    コメント内容が重複
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={detailChecks.dubious}
                      onChange={(e) => setDetailChecks((c) => ({ ...c, dubious: e.target.checked }))}
                      className="rounded border-gray-500"
                    />
                    コメント内容の真偽が怪しい
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={detailChecks.ambiguous}
                      onChange={(e) => setDetailChecks((c) => ({ ...c, ambiguous: e.target.checked }))}
                      className="rounded border-gray-500"
                    />
                    コメント内容が曖昧、間違いではないが、ありきたり
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
          onClick={(e) => e.target === e.currentTarget && !objectionModal.done && closeObjectionModal()}
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

      {disclaimerOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-disclaimer-title"
          onClick={() => setDisclaimerOpen(false)}
        >
          <div
            className="max-h-[min(80vh,28rem)] w-full max-w-md overflow-y-auto rounded-lg border border-gray-600 bg-gray-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ai-disclaimer-title" className="mb-3 text-sm font-semibold text-white">
              AIコメントについて
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-gray-300">{AI_CHAT_DISCLAIMER}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                onClick={() => setDisclaimerOpen(false)}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
