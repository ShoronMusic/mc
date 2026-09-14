'use client';

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  type Ref,
} from 'react';

type YtPlayer = {
  destroy: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  setSize: (width: number, height: number) => void;
};

type YtNamespace = {
  Player: new (
    elementId: string,
    options: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YtPlayer }) => void;
        onStateChange?: (event: { data: number; target: YtPlayer }) => void;
        onError?: (event: { data: number; target: YtPlayer }) => void;
      };
    },
  ) => YtPlayer;
};

type YtApiWindow = Window & {
  YT?: YtNamespace;
  onYouTubeIframeAPIReady?: () => void;
};

function ytWindow(): YtApiWindow {
  return window as unknown as YtApiWindow;
}

let youtubeApiPromise: Promise<void> | null = null;

function loadYoutubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = ytWindow();
  if (w.YT?.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<void>((resolve) => {
    if (w.YT?.Player) {
      resolve();
      return;
    }
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } finally {
        resolve();
      }
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return youtubeApiPromise;
}

export type LibraryYoutubePreviewPlayerHandle = {
  playVideo: () => void;
  pauseVideo: () => void;
  loadVideoById: (videoId: string) => void;
};

type Props = {
  videoId: string;
  /** 増やすと再生を要求（カバークリック）。同じ動画でも再再生する */
  playNonce?: number;
  className?: string;
  iframeTitle?: string;
  onPlaying?: () => void;
  onPausedOrEnded?: () => void;
  onEnded?: () => void;
  onError?: () => void;
};

/**
 * 部屋ライブラリのプレビュー用 YouTube。カバークリックのユーザー操作に合わせて再生する。
 * 部屋本体の YouTubePlayer とは別インスタンス（プレビュー中は部屋側をミュート）。
 */
export function LibraryPreviewPlayerSlot({
  videoId,
  playNonce,
  playerRef,
  iframeTitle,
  className = 'aspect-video',
  onPlaying,
  onPausedOrEnded,
}: {
  videoId: string | null;
  playNonce: number;
  playerRef: Ref<LibraryYoutubePreviewPlayerHandle>;
  iframeTitle: string;
  className?: string;
  onPlaying?: () => void;
  onPausedOrEnded?: () => void;
  onEnded?: () => void;
  onError?: () => void;
}) {
  return (
    <div className={`overflow-hidden rounded border border-gray-800 bg-black ${className}`}>
      {videoId ? (
        <LibraryYoutubePreviewPlayer
          ref={playerRef}
          videoId={videoId}
          playNonce={playNonce}
          iframeTitle={iframeTitle}
          onPlaying={onPlaying}
          onPausedOrEnded={onPausedOrEnded}
        />
      ) : (
        <div className="flex h-full min-h-[8rem] w-full items-center justify-center px-3 text-center text-xs text-gray-500">
          カバーをクリックしてプレビュー再生
        </div>
      )}
    </div>
  );
}

export const LibraryYoutubePreviewPlayer = forwardRef<LibraryYoutubePreviewPlayerHandle, Props>(
  function LibraryYoutubePreviewPlayer(
    { videoId, playNonce = 0, className = '', iframeTitle = 'Library preview', onPlaying, onPausedOrEnded, onEnded, onError },
    ref,
  ) {
    const reactId = useId().replace(/:/g, '');
    const containerId = `lib-yt-${reactId}`;
    const shellRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YtPlayer | null>(null);
    const videoIdRef = useRef(videoId);
    const playNonceRef = useRef(playNonce);
    const appliedPlayNonceRef = useRef(0);
    const onPlayingRef = useRef(onPlaying);
    const onPausedOrEndedRef = useRef(onPausedOrEnded);
    const onEndedRef = useRef(onEnded);
    const onErrorRef = useRef(onError);
    videoIdRef.current = videoId;
    playNonceRef.current = playNonce;
    onPlayingRef.current = onPlaying;
    onPausedOrEndedRef.current = onPausedOrEnded;
    onEndedRef.current = onEnded;
    onErrorRef.current = onError;

    const syncSize = () => {
      const shell = shellRef.current;
      const player = playerRef.current;
      if (!shell || !player || typeof player.setSize !== 'function') return;
      const w = shell.clientWidth;
      const h = shell.clientHeight;
      if (w >= 48 && h >= 48) player.setSize(w, h);
    };

    const playIfRequested = (player: YtPlayer) => {
      if (playNonceRef.current <= appliedPlayNonceRef.current) return;
      appliedPlayNonceRef.current = playNonceRef.current;
      try {
        player.playVideo();
      } catch {
        /* ignore */
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        playVideo() {
          try {
            playerRef.current?.playVideo();
          } catch {
            /* ignore */
          }
        },
        pauseVideo() {
          try {
            playerRef.current?.pauseVideo();
          } catch {
            /* ignore */
          }
        },
        loadVideoById(id: string) {
          try {
            playerRef.current?.loadVideoById(id);
          } catch {
            /* ignore */
          }
        },
      }),
      [],
    );

    useEffect(() => {
      let cancelled = false;
      void (async () => {
        try {
          await loadYoutubeIframeApi();
          const w = ytWindow();
          if (cancelled || !w.YT?.Player) return;
          if (playerRef.current) return;
          const el = document.getElementById(containerId);
          if (!el) return;
          const pageOrigin =
            typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined;
          const shouldAutoplay = playNonceRef.current > appliedPlayNonceRef.current;
          playerRef.current = new w.YT.Player(containerId, {
            videoId: videoIdRef.current,
            width: '100%',
            height: '100%',
            playerVars: {
              controls: 1,
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
              enablejsapi: 1,
              autoplay: shouldAutoplay ? 1 : 0,
              ...(pageOrigin ? { origin: pageOrigin } : {}),
            },
            events: {
              onReady: (event: { target: YtPlayer }) => {
                if (cancelled) return;
                syncSize();
                playIfRequested(event.target);
              },
              onStateChange: (event: { data: number; target: YtPlayer }) => {
                if (event.data === 1) onPlayingRef.current?.();
                if (event.data === 0) onEndedRef.current?.();
                if (event.data === 0 || event.data === 2) onPausedOrEndedRef.current?.();
              },
              onError: () => {
                onErrorRef.current?.();
              },
            },
          });
          requestAnimationFrame(syncSize);
        } catch {
          /* ignore */
        }
      })();

      return () => {
        cancelled = true;
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {
            /* ignore */
          }
          playerRef.current = null;
        }
      };
      // 初回マウントのみ。videoId / playNonce は下の effect で反映する
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [containerId]);

    useEffect(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        if (playNonce > appliedPlayNonceRef.current) {
          appliedPlayNonceRef.current = playNonce;
          player.loadVideoById(videoId);
          return;
        }
        player.cueVideoById(videoId);
      } catch {
        /* ignore */
      }
    }, [videoId, playNonce]);

    useEffect(() => {
      const shell = shellRef.current;
      if (!shell) return;
      const ro = new ResizeObserver(() => syncSize());
      ro.observe(shell);
      window.addEventListener('resize', syncSize);
      const raf = requestAnimationFrame(() => syncSize());
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', syncSize);
        cancelAnimationFrame(raf);
      };
    }, []);

    return (
      <div ref={shellRef} className={`relative h-full w-full overflow-hidden bg-black ${className}`.trim()}>
        <div id={containerId} className="h-full w-full" title={iframeTitle} />
      </div>
    );
  },
);
