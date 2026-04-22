/**
 * 曲解説パックの「終了タイミング」に合わせ、お題付き選曲なら遅延して room-blurb API を叩き AI 発言を足す。
 */

import type { MutableRefObject } from 'react';
import { THEME_PLAYLIST_MISSION_CLIENT_CHANGED_EVENT } from '@/lib/theme-playlist-mission-client-events';

const PACK_END_EXTRA_MS = 5200;

type AddAiMessageFn = (body: string, opts?: Record<string, unknown>) => void;

export type PendingThemePlaylistBlurbRef = MutableRefObject<{
  videoId: string;
  themeId: string;
} | null>;

export type VideoIdStateRef = MutableRefObject<string | null>;

export function scheduleThemePlaylistRoomBlurbAfterPack(options: {
  videoId: string;
  roomId?: string | null;
  selectorDisplayName?: string | null;
  /** 曲解説の最後の setTimeout と同基準の遅延（クイズ開始などと揃える） */
  packEndDelayMs: number;
  commentaryContext: string;
  isGuest: boolean;
  pendingRef: PendingThemePlaylistBlurbRef;
  videoIdRef: VideoIdStateRef;
  registerTimer: (timer: ReturnType<typeof setTimeout>) => void;
  addAiMessage: AddAiMessageFn;
}): void {
  if (options.isGuest) return;

  const delayMs = Math.max(0, options.packEndDelayMs) + PACK_END_EXTRA_MS;
  const timer = setTimeout(() => {
    if (options.videoIdRef.current !== options.videoId) return;
    const p = options.pendingRef.current;
    if (!p || p.videoId !== options.videoId) return;

    const ctx = options.commentaryContext.trim().slice(0, 8000);
    void fetch('/api/user/theme-playlist-mission/room-blurb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        themeId: p.themeId,
        videoId: options.videoId,
        roomId: typeof options.roomId === 'string' ? options.roomId.trim() : '',
        commentaryContext: ctx,
        selectorDisplayName:
          typeof options.selectorDisplayName === 'string'
            ? options.selectorDisplayName.trim().slice(0, 80)
            : '',
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: {
          ok?: boolean;
          ai_comment?: string;
          completed?: boolean;
          entry_count?: number;
        } | null) => {
          if (options.videoIdRef.current !== options.videoId) return;
          if (!data || data.ok !== true || typeof data.ai_comment !== 'string') return;
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(THEME_PLAYLIST_MISSION_CLIENT_CHANGED_EVENT));
          }
          const tail =
            data.completed === true
              ? `（お題リスト ${String(data.entry_count ?? '')}/10 コンプリート）`
              : `（お題リスト ${String(data.entry_count ?? '')}/10）`;
          options.addAiMessage(`【お題講評】 ${data.ai_comment.trim()}\n${tail}`, {
            allowWhenAiStopped: true,
            videoId: options.videoId,
            aiSource: 'theme_playlist_room',
          });
        },
      );
  }, delayMs);
  options.registerTimer(timer);
}
