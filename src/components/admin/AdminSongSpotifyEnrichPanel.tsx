'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Props = {
  songId: string;
  hasTrackId?: boolean;
  hasPopularity?: boolean;
};

type EnrichResult = {
  status?: string;
  reason?: string;
  spotifyTrackId?: string | null;
  spotifyPopularity?: number | null;
  message?: string;
};

export function AdminSongSpotifyEnrichPanel({
  songId,
  hasTrackId = false,
  hasPopularity = false,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const alreadyComplete = hasTrackId && hasPopularity;

  async function runEnrich(): Promise<void> {
    if (alreadyComplete) {
      setMsg('spotify_track_id / popularity は既に入っています。');
      return;
    }
    const ok = window.confirm(
      hasTrackId
        ? '既存の track ID は上書きせず、空の Spotify 項目（popularity 等）だけ補完します。実行しますか？'
        : 'Spotify を検索して track ID / popularity 等を空欄補完します。曖昧な場合はレビューキューへ入ります。実行しますか？',
    );
    if (!ok) return;

    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/domestic-songs-spotify-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dryRun: false,
          songIds: [songId],
          limit: 1,
          ignoreCatalogFilter: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        summary?: { updated?: number; queuedReview?: number };
        results?: EnrichResult[];
      };
      if (!res.ok) {
        setMsg(data.error ?? 'Spotify 取得に失敗しました。');
        return;
      }

      const r = data.results?.find((x) => x.status !== 'skipped_complete') ?? data.results?.[0];
      if (r?.status === 'updated' || (data.summary?.updated ?? 0) > 0) {
        setMsg(
          `反映しました（track: ${r?.spotifyTrackId ?? '—'} / 人気: ${r?.spotifyPopularity ?? '—'}）。`,
        );
        router.refresh();
        return;
      }
      if (r?.status === 'queued_review' || (data.summary?.queuedReview ?? 0) > 0) {
        setMsg(
          `自動反映できずレビューキューへ入れました（${r?.reason ?? 'review'}）。`,
        );
        return;
      }
      if (r?.status === 'skipped_complete') {
        setMsg('補完できる空欄はありませんでした。');
        return;
      }
      if (r?.status === 'skipped_no_token') {
        setMsg('SPOTIFY_CLIENT_ID / SECRET が未設定か無効です。');
        return;
      }
      if (r?.status === 'skipped_no_match' || r?.status === 'skipped_missing_meta') {
        setMsg(`候補が見つかりませんでした（${r.reason ?? r.status}）。`);
        return;
      }
      setMsg(r?.message ?? `結果: ${r?.status ?? 'unknown'}`);
      if (r?.status === 'updated') router.refresh();
    } catch {
      setMsg('Spotify 取得に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded border border-green-900/50 bg-green-950/15 p-3">
      <h3 className="text-sm font-semibold text-green-200">Spotify メタ取得</h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">
        track ID / popularity / 曲名・アーティスト表記などを空欄補完します（邦楽は Spotify{' '}
        <code className="text-gray-500">market=JP</code>）。既存の{' '}
        <code className="text-gray-500">spotify_track_id</code> は上書きしません。曖昧な候補は{' '}
        <Link href="/admin/spotify-review-queue" className="text-sky-400 hover:underline">
          要確認キュー
        </Link>
        へ。
      </p>
      {msg ? (
        <p className="mt-2 text-xs text-green-100" role="status">
          {msg}
        </p>
      ) : null}
      <div className="mt-3">
        <button
          type="button"
          disabled={busy || alreadyComplete}
          onClick={() => void runEnrich()}
          className="rounded bg-green-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? '取得中…'
            : alreadyComplete
              ? 'Spotify 取得済み'
              : hasTrackId
                ? 'Spotify 空欄を補完'
                : 'Spotify から取得'}
        </button>
      </div>
    </div>
  );
}
