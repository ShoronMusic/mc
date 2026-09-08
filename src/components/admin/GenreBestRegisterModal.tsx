'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildGenreBestTabGroups,
  filterGenreBestByTab,
  type GenreBestListItem,
  type GenreBestTabKey,
} from '@/lib/catalog-genre-best';

const SUCCESS_CHIME_URL = '/audio/success-chime.mp3';
/** WP playlist-modal と同程度（animationend と最低 2s の両方を待つ） */
const SUCCESS_MIN_MS = 2000;

type Props = {
  open: boolean;
  songId: string | null;
  songLabel?: string;
  onClose: () => void;
  onRegistered: (playlist: { slug: string; title: string }) => void;
};

function playSuccessChime() {
  try {
    const snd = new Audio(SUCCESS_CHIME_URL);
    void snd.play().catch(() => {
      /* autoplay / ユーザー操作制約は無視 */
    });
  } catch {
    /* ignore */
  }
}

export function GenreBestRegisterModal({
  open,
  songId,
  songLabel,
  onClose,
  onRegistered,
}: Props) {
  const [items, setItems] = useState<GenreBestListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<GenreBestTabKey>('genre');
  const [submittingSlug, setSubmittingSlug] = useState<string | null>(null);
  const [successAnimating, setSuccessAnimating] = useState(false);
  const [seekbarKey, setSeekbarKey] = useState(0);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/genre-best', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '読み込みに失敗しました。');
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError('読み込みに失敗しました。');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSuccessAnimating(false);
    setSubmittingSlug(null);
    setError(null);
    void load();
  }, [open, load]);

  /** WP: animationend + 最低 2s の両方完了後に閉じる */
  useEffect(() => {
    if (!successAnimating) return;
    const fillEl = fillRef.current;
    let cancelled = false;

    const animDone =
      fillEl != null
        ? new Promise<void>((resolve) => {
            const onEnd = () => resolve();
            fillEl.addEventListener('animationend', onEnd, { once: true });
            window.setTimeout(resolve, SUCCESS_MIN_MS + 300);
          })
        : Promise.resolve();
    const twoSec = new Promise<void>((resolve) => {
      window.setTimeout(resolve, SUCCESS_MIN_MS);
    });

    void Promise.all([animDone, twoSec]).then(() => {
      if (cancelled) return;
      setSuccessAnimating(false);
      onCloseRef.current();
    });

    return () => {
      cancelled = true;
    };
  }, [successAnimating, seekbarKey]);

  const tabGroups = useMemo(() => buildGenreBestTabGroups(items), [items]);

  useEffect(() => {
    if (!open || tabGroups.length === 0) return;
    if (!tabGroups.some((g) => g.key === tab)) {
      setTab(tabGroups[0].key);
    }
  }, [open, tabGroups, tab]);

  const visible = useMemo(() => filterGenreBestByTab(items, tab), [items, tab]);

  const register = async (item: GenreBestListItem) => {
    if (!songId || submittingSlug || successAnimating) return;
    setSubmittingSlug(item.slug);
    setError(null);
    playSuccessChime();
    try {
      const res = await fetch(`/api/admin/genre-best/${encodeURIComponent(item.slug)}/songs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '登録に失敗しました。');
        return;
      }
      onRegistered({ slug: item.slug, title: item.title });
      setSeekbarKey((k) => k + 1);
      setSuccessAnimating(true);
    } catch {
      setError('登録に失敗しました。');
    } finally {
      setSubmittingSlug(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="genre-best-modal-title"
      onClick={(e) => {
        if (successAnimating) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @keyframes genre-best-seekbar-fill {
          from { width: 0%; }
          to { width: 100%; }
        }
        .genre-best-seekbar {
          display: none;
          height: 4px;
          width: 100%;
          background: #1a2e1a;
          overflow: hidden;
        }
        .genre-best-seekbar.is-animating {
          display: block;
        }
        .genre-best-seekbar-fill {
          height: 100%;
          width: 0%;
          background: #4caf50;
        }
        .genre-best-seekbar.is-animating .genre-best-seekbar-fill {
          animation: genre-best-seekbar-fill 2s linear forwards;
        }
      `}</style>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-gray-700 bg-gray-950 shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-gray-800 px-4 py-3">
          <div className="min-w-0">
            <h2 id="genre-best-modal-title" className="text-base font-semibold text-white">
              Genre BEST を選択
            </h2>
            {songLabel ? (
              <p className="mt-0.5 truncate text-xs text-gray-400">{songLabel}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              if (successAnimating) return;
              onClose();
            }}
            disabled={successAnimating}
            className="rounded px-2 py-1 text-sm text-gray-400 hover:bg-gray-900 hover:text-white disabled:opacity-40"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div
          key={seekbarKey}
          className={`genre-best-seekbar${successAnimating ? ' is-animating' : ''}`}
          aria-hidden={!successAnimating}
        >
          <div ref={fillRef} className="genre-best-seekbar-fill" />
        </div>

        {successAnimating ? (
          <p className="border-b border-gray-800 px-4 py-2 text-center text-xs text-emerald-400">
            登録しました
          </p>
        ) : null}

        <div
          className="flex flex-wrap gap-1 border-b border-gray-800 px-3 py-2"
          role="tablist"
          aria-label="Genre BEST タブ"
        >
          {tabGroups.map((g) => {
            const active = tab === g.key;
            return (
              <button
                key={g.key}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={successAnimating}
                onClick={() => setTab(g.key)}
                className={`rounded px-2 py-1 text-xs disabled:opacity-50 ${
                  active
                    ? 'bg-emerald-900/50 font-medium text-emerald-200'
                    : 'text-gray-400 hover:bg-gray-900'
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {loading ? <p className="py-6 text-center text-sm text-gray-500">読み込み中…</p> : null}
          {error ? (
            <p className="mb-2 rounded border border-amber-900/50 bg-amber-950/30 px-2 py-1.5 text-xs text-amber-200">
              {error}
            </p>
          ) : null}
          {!loading && visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">該当する Genre BEST がありません</p>
          ) : null}
          <ul className="space-y-1">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!!submittingSlug || successAnimating}
                  onClick={() => void register(item)}
                  className="flex w-full items-center justify-between gap-2 rounded border border-transparent px-2 py-2 text-left hover:border-gray-700 hover:bg-gray-900 disabled:opacity-60"
                >
                  <span className="min-w-0 truncate text-sm text-sky-300">{item.title}</span>
                  <span className="shrink-0 text-xs text-gray-500 tabular-nums">
                    {submittingSlug === item.slug ? '…' : `${item.songCount} songs`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
