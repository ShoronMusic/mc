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
  currentTrackId?: string | null;
  canReset?: boolean;
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
  currentTrackId = null,
  canReset = false,
}: Props) {
  const router = useRouter();
  const workflow = useAdminSongDetailWorkflow();
  const [busy, setBusy] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [alignBusy, setAlignBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [manualTrackId, setManualTrackId] = useState((currentTrackId ?? '').trim());

  useEffect(() => {
    setManualTrackId((currentTrackId ?? '').trim());
  }, [currentTrackId]);

  const alreadyComplete = hasTrackId && hasPopularity;
  const canAlignDisplay = hasTrackId || hasSpotifyArtists;
  const anyBusy = busy || manualBusy || alignBusy || resetBusy;

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

  async function runManualByTrackId(): Promise<boolean> {
    const raw = manualTrackId.trim();
    if (!raw) {
      setMsg('Spotify の track ID または曲 URL を入力してください。');
      return false;
    }
    const existing = (currentTrackId ?? '').trim();
    if (existing && existing !== raw && !raw.includes(existing)) {
      const ok = window.confirm(
        `既存の track ID（${existing}）を、入力した ID で上書きして Spotify から再取得します。実行しますか？`,
      );
      if (!ok) return false;
    }

    setManualBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/song-spotify-by-track-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ songId, spotifyTrackId: raw }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        spotifyTrackId?: string | null;
        spotifyPopularity?: number | null;
        displayTitle?: string | null;
        artistsCreated?: number;
        artistsPatched?: number;
      };
      if (!res.ok) {
        setMsg(data.error ?? '指定 ID からの Spotify 取得に失敗しました。');
        return false;
      }
      const extra =
        (data.artistsCreated ?? 0) > 0 || (data.artistsPatched ?? 0) > 0
          ? ` アーティスト新規 ${data.artistsCreated ?? 0} / 補完 ${data.artistsPatched ?? 0}。`
          : '';
      const displayNote = data.displayTitle ? ` 表示: ${data.displayTitle}` : '';
      setMsg((data.message ?? '反映しました。') + displayNote + extra);
      if (data.spotifyTrackId) setManualTrackId(data.spotifyTrackId);
      workflow?.setFilled('spotify', true);
      router.refresh();
      return true;
    } catch {
      setMsg('指定 ID からの Spotify 取得に失敗しました。');
      return false;
    } finally {
      setManualBusy(false);
    }
  }

  async function runClearSpotifyMeta(): Promise<boolean> {
    if (!canReset) {
      setMsg('リセットする Spotify 値がありません。');
      return false;
    }
    const ok = window.confirm(
      'Spotify の track ID と、曲名・アーティスト表記・公開日・人気度・ジャケットを空にします。main_artist / display_title とクレジットは変えません。実行しますか？',
    );
    if (!ok) return false;

    setResetBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/song-spotify-by-track-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ songId, clear: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setMsg(data.error ?? 'Spotify のリセットに失敗しました。');
        return false;
      }
      setManualTrackId('');
      setMsg(data.message ?? 'Spotify の track ID と関連値を空にしました。');
      workflow?.setFilled('spotify', false);
      router.refresh();
      return true;
    } catch {
      setMsg('Spotify のリセットに失敗しました。');
      return false;
    } finally {
      setResetBusy(false);
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
        <code className="text-gray-500">spotify_artists</code> の並び順を正とします。自動検索で
        合わないときは、下に track ID を入れて再取得できます。誤った track ID は「Spotify をリセット」で空にしてからやり直してください。
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
            disabled={busy || alreadyComplete || manualBusy || resetBusy}
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
          disabled={alignBusy || anyBusy || !canAlignDisplay}
          onClick={() => void runAlignDisplay()}
          className="rounded border border-green-800 bg-green-950/40 px-3 py-1.5 text-xs text-green-100 hover:bg-green-900/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {alignBusy ? '更新中…' : '表示を Spotify 並び順に合わせる'}
        </button>
        <button
          type="button"
          disabled={anyBusy || !canReset}
          onClick={() => void runClearSpotifyMeta()}
          className="rounded border border-amber-800 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-900/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resetBusy ? 'リセット中…' : 'Spotify をリセット'}
        </button>
      </div>
      <div className="mt-3 rounded border border-green-900/40 bg-black/20 p-2.5">
        <p className="text-xs font-medium text-green-100">track ID を指定して取得</p>
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
          検索がずれたときに、Spotify 曲ページの URL または 22 文字の track ID を入れて取得します。曲の
          popularity・アーティスト名、未登録なら artists の ID / 人気度 / 画像も補完します。既存の track ID
          は上書きします。
        </p>
        <label className="mt-2 block text-[11px] text-gray-400">
          Spotify track ID / URL
          <input
            value={manualTrackId}
            onChange={(e) => setManualTrackId(e.target.value)}
            placeholder="https://open.spotify.com/track/… または 22文字 ID"
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 font-mono text-xs text-gray-100"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          disabled={manualBusy || anyBusy || !manualTrackId.trim()}
          onClick={() => void runManualByTrackId()}
          className="mt-2 rounded bg-green-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {manualBusy ? '取得中…' : 'この ID で Spotify から取得'}
        </button>
      </div>
    </div>
  );
}
