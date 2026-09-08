'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminSongDetailWorkflow } from '@/components/admin/AdminSongDetailWorkflow';
import { isAdminSongSpotifyFilled } from '@/lib/admin-song-detail-status';

type Props = {
  songId: string;
  hasTrackId?: boolean;
  hasPopularity?: boolean;
  hasSpotifyArtists?: boolean;
};

type EnrichResult = {
  status?: string;
  reason?: string;
  spotifyTrackId?: string | null;
  spotifyPopularity?: number | null;
  message?: string;
  mainArtist?: string | null;
  displayTitle?: string | null;
};

export function AdminSongSpotifyEnrichPanel({
  songId,
  hasTrackId = false,
  hasPopularity = false,
  hasSpotifyArtists = false,
}: Props) {
  const router = useRouter();
  const workflow = useAdminSongDetailWorkflow();
  const [busy, setBusy] = useState(false);
  const [alignBusy, setAlignBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const alreadyComplete = hasTrackId && hasPopularity;
  const canAlignDisplay = hasTrackId || hasSpotifyArtists;

  useEffect(() => {
    workflow?.setFilled('spotify', isAdminSongSpotifyFilled({ hasTrackId, hasPopularity }));
  }, [workflow, hasTrackId, hasPopularity]);

  async function runAlignDisplay(): Promise<boolean> {
    setAlignBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/song-align-display-from-spotify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ songId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        updated?: boolean;
        displayTitle?: string | null;
      };
      if (!res.ok) {
        setMsg(data.error ?? '表示の更新に失敗しました。');
        return false;
      }
      setMsg(data.message ?? (data.updated ? '表示を更新しました。' : '変更はありません。'));
      if (data.updated) router.refresh();
      return Boolean(data.updated);
    } catch {
      setMsg('表示の更新に失敗しました。');
      return false;
    } finally {
      setAlignBusy(false);
    }
  }

  async function runEnrich(): Promise<boolean> {
    if (alreadyComplete) {
      return runAlignDisplay();
    }
    const ok = window.confirm(
      hasTrackId
        ? '既存の track ID は上書きせず、空の Spotify 項目（popularity 等）だけ補完します。実行しますか？'
        : 'Spotify を検索して track ID / popularity 等を空欄補完します。曖昧な場合はレビューキューへ入ります。実行しますか？',
    );
    if (!ok) return false;

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
        setMsg(data.error || 'Spotify 取得に失敗しました。');
        return false;
      }

      const r = data.results?.find((x) => x.status !== 'skipped_complete') ?? data.results?.[0];
      if (r?.status === 'updated' || (data.summary?.updated ?? 0) > 0) {
        const displayNote = r?.displayTitle ? ` 表示: ${r.displayTitle}` : '';
        setMsg(
          `反映しました（track: ${r?.spotifyTrackId ?? '—'} / 人気: ${r?.spotifyPopularity ?? '—'}）。${displayNote}`,
        );
        workflow?.setFilled('spotify', true);
        router.refresh();
        return true;
      }
      if (r?.status === 'queued_review' || (data.summary?.queuedReview ?? 0) > 0) {
        setMsg(`自動反映できずレビューキューへ入れました（${r?.reason ?? 'review'}）。`);
        return false;
      }
      if (r?.status === 'skipped_complete') {
        setMsg('補完できる空欄はありませんでした。表示を Spotify 並び順に合わせます…');
        return runAlignDisplay();
      }
      if (r?.status === 'skipped_no_token') {
        setMsg('SPOTIFY_CLIENT_ID / SECRET が未設定か無効です。');
        return false;
      }
      if (r?.status === 'skipped_no_match' || r?.status === 'skipped_missing_meta') {
        setMsg(`候補が見つかりませんでした（${r.reason ?? r.status}）。`);
        return false;
      }
      setMsg(r?.message ?? `結果: ${r?.status ?? 'unknown'}`);
      if (r?.status === 'updated') router.refresh();
      return r?.status === 'updated';
    } catch {
      setMsg('Spotify 取得に失敗しました。');
      return false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!workflow) return;
    workflow.registerAction('spotify', runEnrich);
    return () => workflow.registerAction('spotify', null);
  });

  return (
    <div id="spotify-meta" className="mt-3 scroll-mt-20 rounded border border-green-900/50 bg-green-950/15 p-3">
      <h3 className="text-sm font-semibold text-green-200">Spotify メタ取得</h3>
      <p className="mt-1 text-xs leading-relaxed text-gray-400">
        track ID / popularity / 曲名・アーティスト表記などを空欄補完します（邦楽は Spotify{' '}
        <code className="text-gray-500">market=JP</code>）。既存の{' '}
        <code className="text-gray-500">spotify_track_id</code> は上書きしません。曖昧な候補は{' '}
        <Link href="/admin/spotify-review-queue" className="text-sky-400 hover:underline">
          要確認キュー
        </Link>
        へ。共演曲の <code className="text-gray-500">main_artist</code> /{' '}
        <code className="text-gray-500">display_title</code> は{' '}
        <code className="text-gray-500">spotify_artists</code> の並び順を正とします。
      </p>
      {alreadyComplete ? (
        <p className="mt-2 text-xs text-green-200">track ID / popularity は入っています。</p>
      ) : workflow ? (
        <p className="mt-2 text-xs text-gray-500">未取得のときは上部バーの「Spotify 取得」から実行できます。</p>
      ) : null}
      {msg ? (
        <p className="mt-2 text-xs text-green-100" role="status">
          {msg}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {workflow ? null : (
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
        )}
        <button
          type="button"
          disabled={alignBusy || busy || !canAlignDisplay}
          onClick={() => void runAlignDisplay()}
          className="rounded border border-green-800 bg-green-950/40 px-3 py-1.5 text-xs text-green-100 hover:bg-green-900/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {alignBusy ? '更新中…' : '表示を Spotify 並び順に合わせる'}
        </button>
      </div>
    </div>
  );
}
