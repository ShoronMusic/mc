'use client';

/**
 * YouTube IFrame Player API で再生制御。ref で seekTo / playVideo / pauseVideo / loadVideoById を公開。
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { playbackLog } from '@/lib/playback-debug';

const SCRIPT_URL = 'https://www.youtube.com/iframe_api';

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

declare namespace YT {
  class Player {
    constructor(
      elementId: string,
      options: {
        videoId?: string;
        height?: string | number;
        width?: string | number;
        playerVars?: Record<string, string | number>;
        events?: {
          onReady?: () => void;
          onStateChange?: (event: { data: number }) => void;
        };
      }
    );
    getCurrentTime(): number;
    getDuration(): number;
    seekTo(seconds: number, allowSeekAhead?: boolean): void;
    playVideo(): void;
    pauseVideo(): void;
    loadVideoById(videoId: string, startSeconds?: number): void;
    getPlayerState(): number;
    setSize(width: number, height: number): void;
    /** IFrame API: プレイヤー破棄・DOM から iframe を除去 */
    destroy(): void;
  }
  const PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

/** IFrame API の getPlayerState 値（-1 未開始, 0 終了, 1 再生中, 2 一時停止, 3 バッファ, 5 キュー） */
export const YT_PLAYER_STATE_ENDED = 0;
export const YT_PLAYER_STATE_PLAYING = 1;
export const YT_PLAYER_STATE_BUFFERING = 3;

export interface YouTubePlayerHandle {
  seekTo(time: number): void;
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(videoId: string, startSeconds?: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  /** 未初期化・API 未準備時は null */
  getPlayerState(): number | null;
  setVolume(volume: number): void;
  getVolume(): number;
}

interface YouTubePlayerProps {
  videoId: string | null;
  onStateChange?: (state: 'play' | 'pause' | 'ended', currentTime: number) => void;
}

const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ videoId, onStateChange }, ref) {
    const reactId = useId().replace(/:/g, '');
    const containerId = `yt-player-${reactId}`;
    const playerRef = useRef<YT.Player | null>(null);
    const shellRef = useRef<HTMLDivElement>(null);
    const [apiReady, setApiReady] = useState(false);
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;

    const syncPlayerSize = useCallback(() => {
      const shell = shellRef.current;
      const p = playerRef.current;
      if (!shell || !p) return;
      try {
        const w = shell.clientWidth;
        const h = shell.clientHeight;
        if (w >= 48 && h >= 48 && typeof p.setSize === 'function') {
          p.setSize(w, h);
        }
      } catch {
        /* noop */
      }
    }, []);

    useEffect(() => {
      if (typeof window === 'undefined') return;
      if (window.YT?.Player) {
        setApiReady(true);
        return;
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        setApiReady(true);
      };
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      const first = document.getElementsByTagName('script')[0];
      first?.parentNode?.insertBefore(script, first);
      return () => {
        window.onYouTubeIframeAPIReady = prev;
      };
    }, []);

    useEffect(() => {
      if (!apiReady || !videoId) return;
      const id = containerId;

      const setup = () => {
        if (!document.getElementById(id)) {
          playbackLog('YT: setup aborted (no DOM node)', { id, videoId });
          return;
        }
        if (playerRef.current) return;
        playbackLog('YT: creating Player', { id, videoId });
        const pageOrigin =
          typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined;
        playerRef.current = new window.YT.Player(id, {
          videoId,
          height: '100%',
          width: '100%',
          playerVars: {
            playsinline: 1,
            modestbranding: 1,
            rel: 0,
            /** localhost 含め親ページ origin と一致させる（postMessage 宛先不一致エラー緩和） */
            ...(pageOrigin ? { origin: pageOrigin } : {}),
          },
          events: {
            onReady() {
              playbackLog('YT: onReady', { videoId });
              const bump = () => syncPlayerSize();
              bump();
              requestAnimationFrame(bump);
              requestAnimationFrame(() => requestAnimationFrame(bump));
              window.setTimeout(bump, 50);
              window.setTimeout(bump, 200);
              window.setTimeout(bump, 600);
            },
            onStateChange(ev: { data: number }) {
              const p = playerRef.current;
              if (!p || !onStateChangeRef.current) return;
              const t = p.getCurrentTime();
              playbackLog('YT: onStateChange', { state: ev.data, t, videoId });
              if (ev.data === window.YT.PlayerState.PLAYING) {
                onStateChangeRef.current('play', t);
              } else if (ev.data === window.YT.PlayerState.PAUSED) {
                onStateChangeRef.current('pause', t);
              } else if (ev.data === window.YT.PlayerState.ENDED) {
                onStateChangeRef.current('ended', t);
              }
            },
          },
        });
      };

      if (playerRef.current) {
        playbackLog('YT: loadVideoById (existing player)', { videoId });
        playerRef.current.loadVideoById(videoId);
        requestAnimationFrame(() => syncPlayerSize());
        return;
      }
      // DOM が確実に存在するよう少し遅延してから作成
      const t = window.setTimeout(setup, 80);
      return () => {
        clearTimeout(t);
        if (playerRef.current) {
          playbackLog('YT: destroy player (effect cleanup)', { videoId });
          try {
            playerRef.current.destroy();
          } catch {
            /* noop */
          }
          playerRef.current = null;
        }
      };
    }, [apiReady, containerId, videoId, syncPlayerSize]);

    /**
     * 再生対象が無くなったとき（skip で videoId=null など）は
     * iframe を破棄して音の取り残しを防ぐ。
     * DOM ノード自体は残す（React 側の removeChild 競合回避）。
     */
    useEffect(() => {
      if (!apiReady) return;
      if (videoId) return;
      if (!playerRef.current) return;
      playbackLog('YT: destroy player (no videoId)');
      try {
        playerRef.current.destroy();
      } catch {
        /* noop */
      }
      playerRef.current = null;
    }, [apiReady, videoId]);

    useEffect(() => {
      if (!apiReady || !videoId) return;
      const shell = shellRef.current;
      if (!shell) return;
      const ro = new ResizeObserver(() => syncPlayerSize());
      ro.observe(shell);
      window.addEventListener('resize', syncPlayerSize);
      const raf = requestAnimationFrame(() => syncPlayerSize());
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', syncPlayerSize);
        cancelAnimationFrame(raf);
      };
    }, [apiReady, videoId, syncPlayerSize]);

    useImperativeHandle(
      ref,
      () => ({
        seekTo(time: number) {
          const player = playerRef.current;
          if (player && typeof player.seekTo === 'function') player.seekTo(time, true);
        },
        playVideo() {
          const player = playerRef.current;
          if (player && typeof player.playVideo === 'function') player.playVideo();
        },
        pauseVideo() {
          const player = playerRef.current;
          if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
        },
        loadVideoById(vid: string, startSeconds?: number) {
          const player = playerRef.current;
          if (player && typeof player.loadVideoById === 'function') player.loadVideoById(vid, startSeconds ?? 0);
        },
        getCurrentTime() {
          const player = playerRef.current;
          return player && typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : 0;
        },
        getDuration() {
          const player = playerRef.current;
          return player && typeof player.getDuration === 'function' ? player.getDuration() : 0;
        },
        getPlayerState() {
          const player = playerRef.current as { getPlayerState?: () => number } | null;
          if (player && typeof player.getPlayerState === 'function') {
            try {
              return player.getPlayerState();
            } catch {
              return null;
            }
          }
          return null;
        },
        setVolume(volume: number) {
          const player = playerRef.current as any;
          if (player && typeof player?.setVolume === 'function') player.setVolume(volume);
        },
        getVolume() {
          const player = playerRef.current as any;
          if (player && typeof player?.getVolume === 'function') return player.getVolume();
          return 100;
        },
      }),
      []
    );

    /**
     * 常に同一の DOM ノードに YT.Player を載せる。
     * videoId の有無でルート要素を差し替えると、
     * IFrame API 側の非同期 DOM 操作と衝突することがあるため固定化する。
     */
    return (
      <div
        ref={shellRef}
        className="relative aspect-video w-full max-w-full overflow-hidden rounded-lg bg-gray-900"
      >
        <div id={containerId} className="h-full min-h-[180px] w-full" />
        {!videoId && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-gray-800 text-sm text-gray-500">
            YouTube URL を貼って再生
          </div>
        )}
        {!apiReady && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-gray-900/90 text-xs text-gray-500">
            プレイヤー準備中…
          </div>
        )}
      </div>
    );
  }
);

export default YouTubePlayer;
