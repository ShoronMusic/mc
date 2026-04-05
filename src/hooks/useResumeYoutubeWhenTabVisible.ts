'use client';

import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import type { YouTubePlayerHandle } from '@/components/player/YouTubePlayer';
import {
  YT_PLAYER_STATE_BUFFERING,
  YT_PLAYER_STATE_PLAYING,
} from '@/components/player/YouTubePlayer';

/**
 * スマホでタブ／アプリを切り替えたときに OS が YouTube 埋め込みを一時停止することが多い。
 * 完全なバックグラウンド再生はブラウザ仕様で保証できないが、フォアグラウンド復帰時に
 * 「直前まで再生していた」場合は playVideo で再開を試みる。
 */
export function useResumeYoutubeWhenTabVisible(
  playerRef: RefObject<YouTubePlayerHandle | null>,
  videoIdRef: MutableRefObject<string | null>,
  playingRef: MutableRefObject<boolean>,
): void {
  const resumeAfterForegroundRef = useRef(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const snapshotShouldResume = () => {
      const vid = videoIdRef.current;
      if (!vid) {
        resumeAfterForegroundRef.current = false;
        return;
      }
      let st: number | null = null;
      try {
        st = playerRef.current?.getPlayerState?.() ?? null;
      } catch {
        st = null;
      }
      const looksPlaying =
        playingRef.current ||
        st === YT_PLAYER_STATE_PLAYING ||
        st === YT_PLAYER_STATE_BUFFERING;
      resumeAfterForegroundRef.current = looksPlaying;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        snapshotShouldResume();
        requestAnimationFrame(snapshotShouldResume);
        return;
      }
      if (!resumeAfterForegroundRef.current) return;
      resumeAfterForegroundRef.current = false;
      const v = videoIdRef.current;
      if (!v) return;
      window.setTimeout(() => {
        if (videoIdRef.current !== v) return;
        try {
          const st2 = playerRef.current?.getPlayerState?.() ?? null;
          if (st2 === YT_PLAYER_STATE_PLAYING || st2 === YT_PLAYER_STATE_BUFFERING) return;
          playerRef.current?.playVideo();
        } catch {
          playerRef.current?.playVideo();
        }
      }, 200);
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // refs は可変で常に最新を読む
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時のみ登録
  }, []);
}
