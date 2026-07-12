'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { AdminDomesticSongBadge } from '@/components/admin/AdminDomesticSongBadge';
import type { AdminSongSearchItem } from '@/app/api/admin/songs-search/route';

type SongRow = AdminSongSearchItem;

type ArtistEditLink = {
  name: string;
  id: string;
};

async function resolveDomesticArtistEditLinks(
  artistNames: string[],
): Promise<ArtistEditLink[]> {
  const out: ArtistEditLink[] = [];
  const seenIds = new Set<string>();
  for (const name of artistNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    try {
      const res = await fetch(
        `/api/admin/domestic-artist-profile/lookup?name=${encodeURIComponent(trimmed)}`,
        { credentials: 'include' },
      );
      const data = (await res.json().catch(() => ({}))) as {
        artist?: { id?: string; name?: string } | null;
      };
      const id = typeof data.artist?.id === 'string' ? data.artist.id.trim() : '';
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      const canonical =
        (typeof data.artist?.name === 'string' && data.artist.name.trim()) || trimmed;
      out.push({ name: canonical, id });
      // 一覧の main_artist 表記と lookup 正式名が微妙に違う場合に備える
      if (canonical.toLowerCase() !== trimmed.toLowerCase()) {
        out.push({ name: trimmed, id });
      }
    } catch {
      // ignore per-name failures
    }
  }
  return out;
}

export default function AdminSongsPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SongRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [artistEditLinks, setArtistEditLinks] = useState<ArtistEditLink[]>([]);

  const missingDateItems = items.filter((row) => !row.original_release_date?.trim());
  const missingDateCount = missingDateItems.length;
  const missingSpotifyItems = items.filter(
    (row) =>
      row.is_japanese_domestic &&
      (!row.spotify_track_id?.trim() || row.spotify_popularity == null),
  );
  const missingSpotifyCount = missingSpotifyItems.length;

  const artistIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of artistEditLinks) {
      map.set(a.name.trim().toLowerCase(), a.id);
    }
    return map;
  }, [artistEditLinks]);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setItems([]);
      setArtistEditLinks([]);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setBatchMsg(null);
    try {
      const res = await fetch(`/api/admin/songs-search?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data?.error || '検索に失敗しました。');
        setItems([]);
        setArtistEditLinks([]);
        return;
      }
      const nextItems: SongRow[] = Array.isArray(data.items) ? data.items : [];
      setItems(nextItems);

      const nameCounts = new Map<string, number>();
      for (const row of nextItems) {
        const n = (row.main_artist ?? '').trim();
        if (!n) continue;
        nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
      }
      const rankedNames = [...nameCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
        .map(([name]) => name)
        .slice(0, 8);
      if (trimmed && !rankedNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
        rankedNames.unshift(trimmed);
      }
      const links = await resolveDomesticArtistEditLinks(rankedNames.slice(0, 8));
      setArtistEditLinks(links);
    } catch {
      setErrorMsg('検索に失敗しました。');
      setItems([]);
      setArtistEditLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) {
      setItems([]);
      setArtistEditLinks([]);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('q', q);
    window.history.replaceState(null, '', url.pathname + url.search);
    await runSearch(q);
  };

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q')?.trim() ?? '';
    if (!q) return;
    setQuery(q);
    void runSearch(q);
  }, [runSearch]);

  function openSongDetail(songId: string) {
    const q = query.trim();
    const href = q
      ? `/admin/songs/${songId}?q=${encodeURIComponent(q)}`
      : `/admin/songs/${songId}`;
    router.push(href);
  }

  async function handleBatchMusicBrainzDates() {
    if (missingDateCount === 0) return;
    setBatchBusy(true);
    setBatchMsg(null);
    setErrorMsg(null);
    try {
      const songIds = missingDateItems.map((row) => row.id);
      const dryRes = await fetch('/api/admin/songs-batch-musicbrainz-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songIds, dryRun: true }),
      });
      const dryData = (await dryRes.json().catch(() => ({}))) as {
        error?: string;
        summary?: {
          wouldUpdate?: number;
          skippedNotFound?: number;
          skippedNoDate?: number;
        };
        results?: Array<{
          songId: string;
          status: string;
          originalReleaseDate: string | null;
          songTitle: string | null;
        }>;
      };
      if (!dryRes.ok) {
        setBatchMsg(dryData.error ?? '一括取得に失敗しました。');
        return;
      }

      const updates = (dryData.results ?? [])
        .filter((r) => r.status === 'would_update' && r.originalReleaseDate)
        .map((r) => ({
          songId: r.songId,
          originalReleaseDate: r.originalReleaseDate as string,
        }));

      if (updates.length === 0) {
        const s = dryData.summary;
        setBatchMsg(
          `原盤日未取得 ${missingDateCount} 件を照会しましたが、補完できる日付はありませんでした（MB未ヒット ${s?.skippedNotFound ?? 0} / MB日付なし ${s?.skippedNoDate ?? 0}）。`,
        );
        return;
      }

      const ok = window.confirm(
        `原盤日が未登録の ${missingDateCount} 件のうち、${updates.length} 件に MusicBrainz 原盤日があります。DBに反映しますか？`,
      );
      if (!ok) {
        setBatchMsg(`プレビュー完了: ${updates.length} 件を反映可能（キャンセルしました）。`);
        return;
      }

      const applyRes = await fetch('/api/admin/songs-batch-musicbrainz-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, updates }),
      });
      const applyData = (await applyRes.json().catch(() => ({}))) as {
        error?: string;
        summary?: { updated?: number };
      };
      if (!applyRes.ok) {
        setBatchMsg(applyData.error ?? 'DB反映に失敗しました。');
        return;
      }

      setBatchMsg(`原盤日を ${applyData.summary?.updated ?? updates.length} 件反映しました。`);
      if (query.trim()) await runSearch(query.trim());
    } catch {
      setBatchMsg('一括取得に失敗しました。');
    } finally {
      setBatchBusy(false);
    }
  }

  async function handleBatchDomesticSpotifyEnrich() {
    if (missingSpotifyCount === 0) return;
    setBatchBusy(true);
    setBatchMsg(null);
    setErrorMsg(null);
    try {
      const songIds = missingSpotifyItems.map((row) => row.id).slice(0, 50);
      const dryRes = await fetch('/api/admin/domestic-songs-spotify-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songIds, dryRun: true, limit: 50 }),
      });
      const dryData = (await dryRes.json().catch(() => ({}))) as {
        error?: string;
        summary?: {
          targets?: number;
          wouldUpdate?: number;
          wouldReview?: number;
          skippedNoMatch?: number;
          skippedNoToken?: number;
          skippedWesternTreated?: number;
          skippedNotDomestic?: number;
        };
      };
      if (!dryRes.ok) {
        setBatchMsg(dryData.error ?? 'Spotify 一括取得に失敗しました。');
        return;
      }

      const s = dryData.summary;
      if (
        (s?.skippedNoToken ?? 0) > 0 &&
        (s?.wouldUpdate ?? 0) === 0 &&
        (s?.wouldReview ?? 0) === 0
      ) {
        setBatchMsg(
          'SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET が未設定か無効です。.env.local を確認してください。',
        );
        return;
      }

      if ((s?.wouldUpdate ?? 0) === 0 && (s?.wouldReview ?? 0) === 0) {
        setBatchMsg(
          `邦楽の Spotify 未取得 ${missingSpotifyCount} 件を照会しましたが、反映・レビュー候補はありませんでした（対象 ${s?.targets ?? 0} / 未ヒット ${s?.skippedNoMatch ?? 0} / 洋楽扱い除外 ${s?.skippedWesternTreated ?? 0}）。`,
        );
        return;
      }

      const ok = window.confirm(
        `邦楽の Spotify 未取得（表示上 ${missingSpotifyCount} 件）のうち、反映 ${s?.wouldUpdate ?? 0} 件・レビューキュー ${s?.wouldReview ?? 0} 件があります。DB に反映しますか？（最大50件）`,
      );
      if (!ok) {
        setBatchMsg(
          `プレビュー完了: 反映 ${s?.wouldUpdate ?? 0} / レビュー ${s?.wouldReview ?? 0}（キャンセルしました）。`,
        );
        return;
      }

      const applyRes = await fetch('/api/admin/domestic-songs-spotify-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songIds, dryRun: false, limit: 50 }),
      });
      const applyData = (await applyRes.json().catch(() => ({}))) as {
        error?: string;
        summary?: { updated?: number; queuedReview?: number };
      };
      if (!applyRes.ok) {
        setBatchMsg(applyData.error ?? 'DB反映に失敗しました。');
        return;
      }

      setBatchMsg(
        `Spotify を反映 ${applyData.summary?.updated ?? 0} 件、レビューキュー ${applyData.summary?.queuedReview ?? 0} 件。曖昧なものは /admin/spotify-review-queue で確認できます。`,
      );
      if (query.trim()) await runSearch(query.trim());
    } catch {
      setBatchMsg('Spotify 一括取得に失敗しました。');
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col bg-gray-950 p-4 text-gray-100">
      <AdminMenuBar />
      <div className="mb-4">
        <h1 className="text-xl font-semibold">管理者: 曲ダッシュボード（検索）</h1>
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例: Culture Club - Karma Chameleon / artist / title"
          className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={loading}
        >
          検索
        </button>
      </form>

      {errorMsg && (
        <p className="mb-3 text-sm text-red-400" role="alert">
          {errorMsg}
        </p>
      )}

      {loading && <p className="text-sm text-gray-400">検索中...</p>}

      {!loading && items.length === 0 && query.trim() && !errorMsg && (
        <p className="text-sm text-gray-400">一致する曲がありませんでした。</p>
      )}

      {items.length > 0 && (
        <div className="mt-2 space-y-2">
          {artistEditLinks.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">邦楽アーティスト編集:</span>
              {[...new Map(artistEditLinks.map((a) => [a.id, a])).values()].map((a) => (
                <Link
                  key={a.id}
                  href={`/admin/domestic-artist-register/${a.id}`}
                  className="rounded border border-amber-700/70 bg-amber-950/30 px-2.5 py-1 text-xs text-amber-100 hover:bg-amber-900/40"
                >
                  {a.name}
                </Link>
              ))}
            </div>
          ) : null}
          {missingDateCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={batchBusy || loading}
                onClick={() => void handleBatchMusicBrainzDates()}
                className="rounded border border-sky-700 bg-sky-950/40 px-3 py-1.5 text-xs text-sky-100 hover:bg-sky-900/50 disabled:opacity-40"
              >
                {batchBusy
                  ? 'MB一括取得中…'
                  : `原盤日未取得を一括取得（${missingDateCount} 件）`}
              </button>
              <span className="text-xs text-gray-500">
                表示中のうち原盤日が空の曲だけ MusicBrainz 照会（既存日付は触りません）
              </span>
            </div>
          ) : null}
          {missingSpotifyCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={batchBusy || loading}
                onClick={() => void handleBatchDomesticSpotifyEnrich()}
                className="rounded border border-green-700 bg-green-950/40 px-3 py-1.5 text-xs text-green-100 hover:bg-green-900/50 disabled:opacity-40"
              >
                {batchBusy
                  ? 'Spotify一括取得中…'
                  : `Spotify未取得を一括取得（${missingSpotifyCount} 件）`}
              </button>
              <span className="text-xs text-gray-500">
                表示中の邦楽曲で track ID / popularity が空のもの（最大50件・洋楽扱い日本人はサーバ側除外）
              </span>
            </div>
          ) : null}
          {batchMsg ? (
            <p className="text-xs text-sky-200" role="status">
              {batchMsg}
            </p>
          ) : null}
          <div className="overflow-auto rounded border border-gray-700 bg-gray-900">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-800 text-gray-300">
                <tr>
                  <th className="px-3 py-2 text-left">曲名（display_title）</th>
                  <th className="px-3 py-2 text-left">メインアーティスト</th>
                  <th className="px-3 py-2 text-left">曲タイトル</th>
                  <th className="px-3 py-2 text-left">ヨミ</th>
                  <th className="px-3 py-2 text-left">原盤公開日</th>
                  <th className="px-3 py-2 text-right">人気</th>
                  <th className="px-3 py-2 text-right">play_count</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const artistName = (row.main_artist ?? '').trim();
                  const artistEditId = artistName
                    ? artistIdByName.get(artistName.toLowerCase()) ?? null
                    : null;
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-t border-gray-800 hover:bg-gray-800/70"
                      onClick={() => openSongDetail(row.id)}
                    >
                      <td className="px-3 py-2">
                        {row.is_japanese_domestic ? (
                          <span className="mr-2 inline-block align-middle">
                            <AdminDomesticSongBadge />
                          </span>
                        ) : null}
                        {row.display_title || '(no display_title)'}
                      </td>
                      <td className="px-3 py-2">
                        {artistEditId ? (
                          <Link
                            href={`/admin/domestic-artist-register/${artistEditId}`}
                            className="text-amber-200 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {artistName}
                          </Link>
                        ) : (
                          artistName
                        )}
                      </td>
                      <td className="px-3 py-2">{row.song_title || ''}</td>
                      <td className="px-3 py-2 text-gray-300">{row.song_title_ja ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-300">
                        {row.original_release_date ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                        {row.spotify_popularity != null ? row.spotify_popularity : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">{row.play_count ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
