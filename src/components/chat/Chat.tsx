'use client';

/**
 * チャット表示エリア（メッセージ一覧・末尾へスクロール）
 */

import { useEffect, useRef, useState } from 'react';
import {
  HandThumbUpIcon,
  HandThumbDownIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import type { ChatMessage as ChatMessageType } from '@/types/chat';

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

export default function Chat({
  messages,
  currentUserDisplayName,
  userTextColor,
  participantTextColors = {},
  participantsWithColor = [],
  currentVideoId,
}: ChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [feedbackState, setFeedbackState] = useState<Record<string, 'up' | 'down'>>({});
  const [feedbackModal, setFeedbackModal] = useState<FeedbackModalState>({ open: false });
  const [detailChecks, setDetailChecks] = useState({ duplicate: false, dubious: false, ambiguous: false });
  const [detailComment, setDetailComment] = useState('');

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

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900/50">
      <div className="border-b border-gray-700 px-3 py-2 text-sm font-medium text-gray-300">
        チャット
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
                  <span className="text-xs text-gray-500">
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
                  {m.body}
                </p>
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
                  <div className="mt-1 flex items-center gap-1 text-xs">
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
    </div>
  );
}
