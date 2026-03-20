'use client';

/**
 * メッセージ入力欄（送信 / YouTube URL のときは動画再生に転送）
 */

import { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { MAX_MESSAGE_LENGTH } from '@/lib/chat-limits';
import { NON_YOUTUBE_URL_SYSTEM_MESSAGE } from '@/lib/chat-non-youtube-url';
import { extractVideoId, isStandaloneNonYouTubeUrl } from '@/lib/youtube';

type SearchResultRow = {
  videoId: string;
  title: string;
  channelTitle: string;
  artistTitle: string;
  thumbnailUrl?: string;
};

export interface ChatInputHandle {
  /** 入力欄の末尾に文字列を追加する（参加者名クリック用） */
  insertText: (text: string) => void;
}

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  onVideoUrl?: (url: string) => void;
  onSystemMessage?: (text: string) => void;
  /** 検索結果から「候補リスト」に追加するためのコールバック（任意） */
  onAddCandidate?: (row: SearchResultRow) => void;
  /** プレビュー開始（メイン再生の音を下げる用途など） */
  onPreviewStart?: (videoId: string) => void;
  /** プレビュー終了（メイン再生の音を戻す用途など） */
  onPreviewStop?: () => void;
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { onSendMessage, onVideoUrl, onSystemMessage, onAddCandidate, onPreviewStart, onPreviewStop },
  ref
) {
  const [value, setValue] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResultsOpen, setSearchResultsOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultRow[]>([]);
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [watchedVideoIds, setWatchedVideoIds] = useState<string[]>([]);
  const [addedCandidateVideoIds, setAddedCandidateVideoIds] = useState<string[]>([]);
  const previewWatchedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playCandidateAddedSe = useCallback(() => {
    // クリック（ユーザー操作）内で呼ばれるので、ブラウザの自動再生制限を回避しやすい
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx: AudioContext = audioCtxRef.current ?? new AudioCtx();
      audioCtxRef.current = ctx;
      const now = ctx.currentTime;

      const playTone = (freq: number, t0: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;

        // 発音のエンベロープ（軽やかな短いSE）
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur);
      };

      // C5 -> E5（ワンクリエイティブなチャイム）
      playTone(523.25, now, 0.07);
      playTone(659.25, now + 0.08, 0.07);
    } catch {
      // 音が鳴らなくてもUIは継続
    }
  }, []);

  useImperativeHandle(ref, () => ({
    insertText(text: string) {
      setValue((v) => v + text);
      inputRef.current?.focus();
    },
  }), []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const videoId = extractVideoId(trimmed);
    if (videoId && onVideoUrl) {
      onVideoUrl(trimmed);
      setValue('');
      return;
    }

    if (isStandaloneNonYouTubeUrl(trimmed)) {
      onSystemMessage?.(NON_YOUTUBE_URL_SYSTEM_MESSAGE);
      return;
    }

    onSendMessage(trimmed);
    setValue('');
  };

  const handleSearchAndPlay = async () => {
    const trimmed = value.trim();
    if (!trimmed || !onVideoUrl) return;
    // URLなら通常送信に任せる
    const asVideoId = extractVideoId(trimmed);
    if (asVideoId) {
      handleSubmit();
      return;
    }
    if (isStandaloneNonYouTubeUrl(trimmed)) {
      onSystemMessage?.(NON_YOUTUBE_URL_SYSTEM_MESSAGE);
      return;
    }
    try {
      setSearching(true);
      const res = await fetch('/api/ai/search-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed, maxResults: 5 }),
      });
      const data = res.ok ? await res.json() : null;
      if (data?.reason === 'youtube_not_configured') {
        onSystemMessage?.('曲名検索を使うには、サーバーに YOUTUBE_API_KEY の設定が必要です。管理者が設定後、開発サーバー再起動で有効になります。');
      } else {
        const list: SearchResultRow[] = Array.isArray(data?.results)
          ? data.results
              .filter((r: any) => r && typeof r.videoId === 'string')
              .map((r: any) => ({
                videoId: r.videoId,
                title: r.title ?? '',
                channelTitle: r.channelTitle ?? '',
                artistTitle: r.artistTitle ?? '',
                thumbnailUrl: typeof r.thumbnailUrl === 'string' ? r.thumbnailUrl : undefined,
              }))
          : [];
        if (list.length === 0) {
          onSystemMessage?.('曲が見つかりませんでした。別のキーワードでもう一度お試しください。');
          return;
        }
        setSearchResults(list);
        setWatchedVideoIds([]);
        setAddedCandidateVideoIds([]);
        setSearchResultsOpen(true);
      }
    } catch {
      onSystemMessage?.('検索に失敗しました。しばらくしてから再度お試しください。');
    } finally {
      setSearching(false);
    }
  };

  const stopPreview = () => {
    if (previewWatchedTimerRef.current) {
      clearTimeout(previewWatchedTimerRef.current);
      previewWatchedTimerRef.current = null;
    }
    setPreviewOpen(false);
    setPreviewVideoId(null);
    onPreviewStop?.();
  };

  const startPreview = (videoId: string) => {
    // 既に同じ動画をプレビュー中なら何もしない
    if (previewOpen && previewVideoId === videoId) return;

    if (previewWatchedTimerRef.current) {
      clearTimeout(previewWatchedTimerRef.current);
      previewWatchedTimerRef.current = null;
    }

    setPreviewVideoId(videoId);
    setPreviewOpen(true);
    onPreviewStart?.(videoId);

    // 完全な「視聴完了」判定はできないので、数秒再生したら「視聴済み」扱いにする
    previewWatchedTimerRef.current = setTimeout(() => {
      setWatchedVideoIds((prev) => (prev.includes(videoId) ? prev : [...prev, videoId]));
      previewWatchedTimerRef.current = null;
    }, 3000);
  };

  return (
    <>
      {searchResultsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="検索結果"
          onClick={() => setSearchResultsOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded border border-gray-700 bg-gray-900 p-4 text-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">検索結果（上位5件）</div>
              <button
                type="button"
                className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700"
                onClick={() => setSearchResultsOpen(false)}
              >
                閉じる
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <ul className="space-y-2">
                {searchResults.map((r) => (
                  <li key={r.videoId}>
                    <div className="flex w-full items-stretch gap-3 rounded border border-gray-700 bg-gray-800/60 px-3 py-2">
                      {r.thumbnailUrl && (
                        <div className="h-12 w-20 flex-shrink-0 overflow-hidden rounded bg-black/40">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={r.thumbnailUrl}
                            alt={r.title || r.artistTitle}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-100 line-clamp-1">
                          {r.artistTitle}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-400 line-clamp-2">
                          {r.title} / {r.channelTitle}
                        </div>
                      </div>
                      <div className="flex flex-col items-stretch gap-1">
                        <button
                          type="button"
                          className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-700"
                          onClick={() => {
                            startPreview(r.videoId);
                          }}
                        >
                          プレビュー
                        </button>
                        {onAddCandidate && (
                          <button
                            type="button"
                            disabled={
                              !watchedVideoIds.includes(r.videoId) || addedCandidateVideoIds.includes(r.videoId)
                            }
                            className="rounded border border-emerald-600 bg-emerald-900/40 px-2 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-800/70 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              if (!watchedVideoIds.includes(r.videoId)) return;
                              if (addedCandidateVideoIds.includes(r.videoId)) return;
                              playCandidateAddedSe();
                              onAddCandidate(r);
                              setAddedCandidateVideoIds((prev) =>
                                prev.includes(r.videoId) ? prev : [...prev, r.videoId],
                              );
                            }}
                          >
                            {addedCandidateVideoIds.includes(r.videoId)
                              ? '追加済み'
                              : watchedVideoIds.includes(r.videoId)
                                ? '候補'
                                : '候補（視聴後）'}
                          </button>
                        )}
                        {onVideoUrl && (
                          <button
                            type="button"
                            className="rounded border border-blue-500/70 bg-blue-900/40 px-2 py-1 text-[11px] text-blue-100 hover:bg-blue-900/70"
                            onClick={() => {
                              onVideoUrl(
                                `https://www.youtube.com/watch?v=${encodeURIComponent(r.videoId)}`,
                              );
                              setSearchResultsOpen(false);
                              setValue('');
                            }}
                          >
                            今すぐ貼る
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {previewOpen && previewVideoId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="プレビュー"
          onClick={() => stopPreview()}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded border border-gray-700 bg-gray-900 p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-100">プレビュー</div>
              <button
                type="button"
                className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700"
                onClick={() => stopPreview()}
              >
                閉じる
              </button>
            </div>
            <div className="aspect-video overflow-hidden rounded bg-black">
              <iframe
                title="YouTube preview"
                src={`https://www.youtube.com/embed/${encodeURIComponent(
                  previewVideoId,
                )}?autoplay=1&controls=1&modestbranding=1`}
                className="h-full w-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-2">
        <details className="mb-2 rounded border border-gray-700/80 bg-gray-900/80 px-2 py-1.5 text-[11px] leading-snug text-gray-400 open:border-amber-900/40 open:bg-amber-950/20">
          <summary className="cursor-pointer select-none text-amber-200/90 marker:text-gray-500 hover:text-amber-100">
            この欄の使い方（送信／検索の2通り）
          </summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-gray-400">
            <li>
              <span className="font-medium text-gray-300">送信</span>
              ：<span className="text-gray-300">YouTube のURL</span>
              を入れて押すと、ルームのプレイヤーにその動画が表示されます。URL
              <span className="text-gray-300">以外</span>（感想・会話など）はチャットに表示されます。
            </li>
            <li>
              <span className="font-medium text-gray-300">検索</span>
              ：アーティスト名・曲名などの
              <span className="text-gray-300">キーワード</span>
              を入れて押すと、候補動画の一覧が開きます（別タブではなくこの画面の上に表示されます）。
            </li>
          </ul>
        </details>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="URL・メッセージ・曲名のどれでも入力…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
            maxLength={MAX_MESSAGE_LENGTH}
            className="flex-1 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
            aria-label="チャット入力"
          />
          <button
            type="button"
            onClick={handleSubmit}
            title="YouTubeのURLならプレイヤーに反映。それ以外はチャットに表示"
            className="shrink-0 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50"
            disabled={!value.trim()}
          >
            送信
          </button>
          {onVideoUrl && (
            <button
              type="button"
              onClick={handleSearchAndPlay}
              title="キーワードでYouTube検索し、結果一覧を表示（URLを入れた場合は送信と同じくプレイヤーへ）"
              className="shrink-0 rounded border border-blue-500/60 bg-blue-900/20 px-4 py-2 text-sm font-medium text-blue-200 hover:bg-blue-900/35 disabled:opacity-50"
              disabled={!value.trim() || searching}
              aria-label="曲名・キーワードで検索"
            >
              {searching ? '…' : '検索'}
            </button>
          )}
        </div>
      </div>
    </>
  );
});

export default ChatInput;
