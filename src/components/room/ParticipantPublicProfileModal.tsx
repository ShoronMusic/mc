'use client';

import { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

type Props = {
  open: boolean;
  onClose: () => void;
  targetUserId: string | null;
  displayName: string;
  viewerIsGuest: boolean;
};

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ok';
      visibleInRooms: boolean;
      tagline: string;
      favoriteArtists: string[];
      listeningNote: string;
      hasRow: boolean;
      isSelf: boolean;
    };

export default function ParticipantPublicProfileModal({
  open,
  onClose,
  targetUserId,
  displayName,
  viewerIsGuest,
}: Props) {
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    if (!open) {
      setState({ status: 'idle' });
      return;
    }
    if (viewerIsGuest) {
      setState({ status: 'error', message: '登録ユーザーでログインすると、他の方の公開プロフィールを表示できます。' });
      return;
    }
    if (!targetUserId) {
      setState({ status: 'error', message: 'プロフィールを表示できません。' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    void fetch(`/api/user/public-profile?forUserId=${encodeURIComponent(targetUserId)}`, {
      credentials: 'include',
    })
      .then(async (r) => {
        const json = (await r.json().catch(() => null)) as Record<string, unknown> | null;
        if (cancelled) return;
        if (!r.ok) {
          const msg = typeof json?.error === 'string' ? json.error : '読み込みに失敗しました。';
          setState({ status: 'error', message: msg });
          return;
        }
        const artists = Array.isArray(json?.favoriteArtists)
          ? (json!.favoriteArtists as unknown[]).filter((x): x is string => typeof x === 'string')
          : [];
        setState({
          status: 'ok',
          visibleInRooms: Boolean(json?.visibleInRooms),
          tagline: typeof json?.tagline === 'string' ? json.tagline : '',
          favoriteArtists: artists,
          listeningNote: typeof json?.listeningNote === 'string' ? json.listeningNote : '',
          hasRow: Boolean(json?.hasRow),
          isSelf: Boolean(json?.isSelf),
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', message: '読み込みに失敗しました。' });
      });
    return () => {
      cancelled = true;
    };
  }, [open, targetUserId, viewerIsGuest]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const title = `${displayName}さんのプロフィール`;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="participant-public-profile-title"
      onClick={onClose}
    >
      <div
        className="max-h-[min(80vh,520px)] w-full max-w-md overflow-y-auto rounded-xl border border-gray-600 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-gray-700 px-4 py-3">
          <h2 id="participant-public-profile-title" className="text-base font-semibold text-gray-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700"
            aria-label="閉じる"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 py-3 text-sm text-gray-300">
          {state.status === 'loading' && <p className="text-gray-400">読み込み中…</p>}
          {state.status === 'error' && <p className="text-amber-200/95">{state.message}</p>}
          {state.status === 'ok' && (
            <>
              {!state.isSelf && !state.hasRow && (
                <p className="text-gray-400">
                  このユーザーはプロフィールを公開していないか、まだ登録していません。
                </p>
              )}
              {state.isSelf && !state.visibleInRooms && (
                <p className="mb-2 text-xs text-gray-500">
                  現在「他の参加者に公開」はオフです。マイページで編集・公開できます。
                </p>
              )}
              {(state.tagline.trim() ||
                state.favoriteArtists.length > 0 ||
                state.listeningNote.trim()) && (
                <div className="space-y-3">
                  {state.tagline.trim() ? (
                    <p className="whitespace-pre-wrap text-gray-100">{state.tagline.trim()}</p>
                  ) : null}
                  {state.favoriteArtists.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium text-gray-500">好きなアーティスト</p>
                      <ul className="mt-1 list-inside list-disc text-gray-200">
                        {state.favoriteArtists.map((a, i) => (
                          <li key={`${a}-${i}`}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {state.listeningNote.trim() ? (
                    <div>
                      <p className="text-xs font-medium text-gray-500">補足</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-gray-300">{state.listeningNote.trim()}</p>
                    </div>
                  ) : null}
                </div>
              )}
              {state.isSelf &&
                !state.tagline.trim() &&
                state.favoriteArtists.length === 0 &&
                !state.listeningNote.trim() && (
                  <p className="text-gray-400">まだ未入力です。マイページの「他ユーザー向けプロフィール」から登録できます。</p>
                )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
