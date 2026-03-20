'use client';

/**
 * YouTube IFrame Player API で再生制御。ref で seekTo / playVideo / pauseVideo / loadVideoById を公開。
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

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
        events?: { onStateChange?: (event: { data: number }) => void };
      }
    );
    getCurrentTime(): number;
    getDuration(): number;
    seekTo(seconds: number, allowSeekAhead?: boolean): void;
    playVideo(): void;
    pauseVideo(): void;
    loadVideoById(videoId: string, startSeconds?: number): void;
    getPlayerState(): number;
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

export interface YouTubePlayerHandle {
  seekTo(time: number): void;
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(videoId: string, startSeconds?: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  setVolume(volume: number): void;
  getVolume(): number;
}

interface YouTubePlayerProps {
  videoId: string | null;
  onStateChange?: (state: 'play' | 'pause' | 'ended', currentTime: number) => void;
}

const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ videoId, onStateChange }, ref) {
    const containerId = useRef(`yt-player-${Math.random().toString(36).slice(2, 9)}`);
    const playerRef = useRef<YT.Player | null>(null);
    const [apiReady, setApiReady] = useState(false);
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;

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
      const id = containerId.current;

      const setup = () => {
        if (!document.getElementById(id)) return;
        if (playerRef.current) return;
        playerRef.current = new window.YT.Player(id, {
          videoId,
          height: '100%',
          width: '100%',
          events: {
            onStateChange(ev: { data: number }) {
              const p = playerRef.current;
              if (!p || !onStateChangeRef.current) return;
              const t = p.getCurrentTime();
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
        playerRef.current.loadVideoById(videoId);
        return;
      }
      // DOM が確実に存在するよう少し遅延してから作成
      const t = setTimeout(setup, 80);
      return () => {
        clearTimeout(t);
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {
            /* noop */
          }
          playerRef.current = null;
        }
      };
    }, [apiReady, videoId]);

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

    if (!videoId) {
      return (
        <div className="aspect-video flex items-center justify-center rounded-lg bg-gray-800 text-sm text-gray-500">
          YouTube URL を貼って再生
        </div>
      );
    }

    // API がまだのときは簡易 iframe で即表示（クリックに反応するように）
    if (!apiReady) {
      return (
        <div className="aspect-video overflow-hidden rounded-lg bg-gray-900">
          <iframe
            title="YouTube player"
            src={`https://www.youtube.com/embed/${videoId}?autoplay=0`}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }

    return (
      <div className="aspect-video overflow-hidden rounded-lg bg-gray-900">
        <div id={containerId.current} className="h-full w-full min-h-[200px]" />
      </div>
    );
  }
);

export default YouTubePlayer;
