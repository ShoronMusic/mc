'use client';

import { useEffect, useId, useRef, useState } from 'react';

type YtPlayer = {
  destroy: () => void;
  setVolume: (n: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
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
      };
    },
  ) => YtPlayer;
};

/** YouTubePlayer.tsx の global Window.YT と修飾子衝突しないよう、ここでは局所型のみ使う */
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

type Props = {
  videoId: string;
  className?: string;
  /** プレイヤー枠の追加 class（例: min-h） */
  playerClassName?: string;
};

/**
 * 管理画面用 YouTube 埋め込み。
 * iframe 内の音量スライダーは狭い枠だと掴みにくいため、外側に音量 UI を置く。
 */
export function AdminYoutubePlayerWithVolume({
  videoId,
  className = '',
  playerClassName = '',
}: Props) {
  const reactId = useId().replace(/:/g, '');
  const containerId = `admin-yt-${reactId}`;
  const playerRef = useRef<YtPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);

    void (async () => {
      try {
        await loadYoutubeIframeApi();
        const w = ytWindow();
        if (cancelled || !w.YT?.Player) return;

        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {
            /* ignore */
          }
          playerRef.current = null;
        }

        const el = document.getElementById(containerId);
        if (!el) return;

        playerRef.current = new w.YT.Player(containerId, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
          },
          events: {
            onReady: (event: { target: YtPlayer }) => {
              if (cancelled) return;
              try {
                event.target.setVolume(volume);
                if (muted) event.target.mute();
                else event.target.unMute();
              } catch {
                /* ignore */
              }
              setReady(true);
            },
          },
        });
      } catch {
        if (!cancelled) setError('YouTube プレイヤーの初期化に失敗しました。');
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
    // videoId 変更時のみ作り直す（volume/muted は操作側で反映）
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [videoId, containerId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;
    try {
      player.setVolume(volume);
      if (muted || volume <= 0) player.mute();
      else player.unMute();
    } catch {
      /* ignore */
    }
  }, [volume, muted, ready]);

  function toggleMute() {
    if (muted) {
      setMuted(false);
      if (volume <= 0) setVolume(40);
    } else {
      setMuted(true);
    }
  }

  return (
    <div className={`min-w-0 ${className}`}>
      <div
        className={`relative aspect-video w-full overflow-hidden rounded border border-gray-700 bg-black shadow-inner [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full ${playerClassName}`}
      >
        <div id={containerId} className="absolute inset-0 h-full w-full" />
      </div>

      <div className="mt-2 flex items-center gap-2 rounded border border-gray-700 bg-gray-950/80 px-2.5 py-2">
        <button
          type="button"
          onClick={toggleMute}
          disabled={!ready}
          className="shrink-0 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-800 disabled:opacity-40"
          aria-label={muted || volume <= 0 ? 'ミュート解除' : 'ミュート'}
          title={muted || volume <= 0 ? 'ミュート解除' : 'ミュート'}
        >
          {muted || volume <= 0 ? 'ミュート中' : '音量'}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={muted ? 0 : volume}
          disabled={!ready}
          onChange={(e) => {
            const next = Number(e.target.value);
            setVolume(next);
            setMuted(next <= 0);
          }}
          className="h-2 min-w-0 flex-1 cursor-pointer accent-amber-400 disabled:opacity-40"
          aria-label="再生音量"
        />
        <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-gray-400">
          {muted ? 0 : volume}
        </span>
      </div>

      {error ? <p className="mt-1 text-[11px] text-amber-300">{error}</p> : null}
      {!ready && !error ? (
        <p className="mt-1 text-[11px] text-gray-500">プレイヤー準備中…</p>
      ) : null}
    </div>
  );
}
