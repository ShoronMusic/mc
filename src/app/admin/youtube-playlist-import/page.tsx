'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import type { AdminYoutubePlaylistImportItem } from '@/app/api/admin/youtube-playlist-import/route';
import { SONG_STYLE_OPTIONS } from '@/lib/song-styles';

type ApiResponse = {
  error?: string;
  playlistId?: string;
  dryRun?: boolean;
  warnings?: string[];
  summary?: {
    fetched: number;
    uniqueVideoIds: number;
    imported: number;
    skippedExisting: number;
    failed: number;
  };
  items?: AdminYoutubePlaylistImportItem[];
};

const EXAMPLE_URL = 'https://www.youtube.com/watch?v=KQetemT1sWc&list=PL0jp-uZ7a4g9FQWW5R_u0pz4yzV4RiOXu';

function formatCount(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ja-JP').format(value);
}

function statusLabel(status: AdminYoutubePlaylistImportItem['status']): string {
  switch (status) {
    case 'imported':
      return '取込済み';
    case 'skipped_existing':
      return '既存重複でスキップ';
    case 'dry_run':
      return 'dry-run（未保存）';
    case 'failed':
      return '失敗';
    default:
      return status;
  }
}

function statusClass(status: AdminYoutubePlaylistImportItem['status']): string {
  switch (status) {
    case 'imported':
      return 'text-emerald-300';
    case 'skipped_existing':
      return 'text-gray-400';
    case 'dry_run':
      return 'text-sky-300';
    case 'failed':
      return 'text-red-300';
    default:
      return 'text-gray-300';
  }
}

export default function AdminYoutubePlaylistImportPage() {
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [maxItems, setMaxItems] = useState(500);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ApiResponse['summary'] | null>(null);
  const [items, setItems] = useState<AdminYoutubePlaylistImportItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastDryRunKey, setLastDryRunKey] = useState<string | null>(null);
  const [bulkStyle, setBulkStyle] = useState<(typeof SONG_STYLE_OPTIONS)[number]>('Pop');
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkArtist, setBulkArtist] = useState('');
  const [bulkArtistSource, setBulkArtistSource] = useState('__all__');
  const [bulkArtistApplying, setBulkArtistApplying] = useState(false);
  const [bulkArtistMessage, setBulkArtistMessage] = useState<string | null>(null);

  function buildRunKey(url: string, max: number): string {
    return `${url.trim()}::${max}`;
  }

  async function submitImport(dryRun: boolean): Promise<void> {
    const url = playlistUrl.trim();
    if (!url) {
      setError('YouTube playlist URL を入力してください。');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSummary(null);
    setItems([]);
    setWarnings([]);
    setPlaylistId(null);
    try {
      const res = await fetch('/api/admin/youtube-playlist-import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistUrl: url,
          maxItems,
          dryRun,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '取り込みに失敗しました。');
        return;
      }
      setPlaylistId(typeof data.playlistId === 'string' ? data.playlistId : null);
      setSummary(data.summary ?? null);
      setItems(Array.isArray(data.items) ? data.items : []);
      setWarnings(Array.isArray(data.warnings) ? data.warnings.filter((x): x is string => typeof x === 'string') : []);
      if (dryRun) {
        setLastDryRunKey(buildRunKey(url, maxItems));
      }
    } catch {
      setError('取り込みに失敗しました。');
    } finally {
      setSubmitting(false);
    }
  }

  const canRunImport = lastDryRunKey === buildRunKey(playlistUrl, maxItems);
  const bulkSongIds = Array.from(
    new Set(
      items
        .map((x) => (typeof x.songId === 'string' ? x.songId.trim() : ''))
        .filter(Boolean),
    ),
  );
  const sourceArtistOptions = Array.from(
    new Set(
      items
        .map((x) => (typeof x.artist === 'string' ? x.artist.trim() : ''))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

  const bulkArtistTargetSongIds = Array.from(
    new Set(
      items
        .filter((x) => (bulkArtistSource === '__all__' ? true : x.artist === bulkArtistSource))
        .map((x) => (typeof x.songId === 'string' ? x.songId.trim() : ''))
        .filter(Boolean),
    ),
  );

  async function applyStyleBulk(): Promise<void> {
    if (bulkSongIds.length === 0) {
      setBulkMessage('対象の song_id がありません。まず本番取り込みを実行してください。');
      return;
    }
    setBulkApplying(true);
    setBulkMessage(null);
    try {
      const res = await fetch('/api/admin/song-style-bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songIds: bulkSongIds,
          style: bulkStyle,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; updatedCount?: number; mergedCount?: number };
      if (!res.ok) {
        setBulkMessage(data.error ?? '一括スタイル登録に失敗しました。');
        return;
      }
      setBulkMessage(`スタイル「${bulkStyle}」を ${data.updatedCount ?? 0} 件に登録しました。`);
    } catch {
      setBulkMessage('一括スタイル登録に失敗しました。');
    } finally {
      setBulkApplying(false);
    }
  }

  async function applyArtistBulk(): Promise<void> {
    const artist = bulkArtist.trim();
    if (!artist) {
      setBulkArtistMessage('統一したいアーティスト名を入力してください。');
      return;
    }
    if (bulkArtistTargetSongIds.length === 0) {
      setBulkArtistMessage('対象の song_id がありません。まず本番取り込みを実行してください。');
      return;
    }
    setBulkArtistApplying(true);
    setBulkArtistMessage(null);
    try {
      const res = await fetch('/api/admin/song-artist-bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songIds: bulkArtistTargetSongIds,
          mainArtist: artist,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        updatedCount?: number;
        mergedCount?: number;
      };
      if (!res.ok) {
        setBulkArtistMessage(data.error ?? '一括アーティスト補正に失敗しました。');
        return;
      }
      const sourceLabel = bulkArtistSource === '__all__' ? '全artist' : bulkArtistSource;
      setBulkArtistMessage(
        `対象「${sourceLabel}」をアーティスト「${artist}」で ${data.updatedCount ?? 0} 件補正（重複マージ ${data.mergedCount ?? 0} 件）しました。`,
      );
    } catch {
      setBulkArtistMessage('一括アーティスト補正に失敗しました。');
    } finally {
      setBulkArtistApplying(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />
      <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">YouTube プレイリスト取込</h1>
      <p className="mt-2 text-sm text-gray-400">
        YouTube playlist URL を入力して、曲マスタへ取り込みます。既存の <code className="rounded bg-gray-800 px-1">video_id</code>{' '}
        は自動で除外されます。保存前に外部ソース（MusicBrainz / YouTube）で公開日を解決し、実行結果は全件一覧で確認できます。
      </p>

      <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <label className="block text-xs text-gray-400">
          YouTube playlist URL
          <input
            type="url"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder={EXAMPLE_URL}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-400">
            最大取得件数
            <input
              type="number"
              min={1}
              max={1000}
              value={maxItems}
              onChange={(e) => setMaxItems(Math.max(1, Math.min(1000, Number.parseInt(e.target.value, 10) || 500)))}
              className="mt-1 block w-28 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <button
            type="button"
            onClick={() => void submitImport(true)}
            disabled={submitting}
            className="rounded border border-sky-600 bg-sky-950/40 px-4 py-2 text-sm font-medium text-sky-100 hover:bg-sky-900/60 disabled:opacity-50"
          >
            {submitting ? '実行中…' : '① dry-run 実行（保存なし）'}
          </button>
          <button
            type="button"
            onClick={() => void submitImport(false)}
            disabled={submitting || !canRunImport}
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? '実行中…' : '② 本番取り込み実行'}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          本番実行は、同じ URL / 件数で dry-run を実行した後のみ有効になります。
        </p>
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </section>

      {summary ? (
        <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm text-gray-200">
          <p className="text-xs text-gray-400">playlistId: {playlistId ?? '—'}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <span>取得: {summary.fetched}</span>
            <span>ユニーク videoId: {summary.uniqueVideoIds}</span>
            <span className="text-emerald-300">取り込み: {summary.imported}</span>
            <span className="text-gray-400">既存除外: {summary.skippedExisting}</span>
            <span className="text-red-300">失敗: {summary.failed}</span>
          </div>
        </section>
      ) : null}

      {warnings.length > 0 ? (
        <section className="mt-4 rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-xs text-amber-200">
          {warnings.map((w, idx) => (
            <p key={`${idx}-${w}`}>{w}</p>
          ))}
        </section>
      ) : null}

      {items.length > 0 ? (
        <section className="mt-4 rounded-lg border border-gray-800 bg-gray-900/40 p-3">
          <h2 className="text-sm font-semibold text-amber-200">スタイル一括登録（10分類）</h2>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <select
              value={bulkStyle}
              onChange={(e) => setBulkStyle(e.target.value as (typeof SONG_STYLE_OPTIONS)[number])}
              className="rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-gray-100"
            >
              {SONG_STYLE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void applyStyleBulk()}
              disabled={bulkApplying || bulkSongIds.length === 0}
              className="rounded bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
            >
              {bulkApplying ? '登録中…' : `この表の曲に一括登録（${bulkSongIds.length}件）`}
            </button>
          </div>
          {bulkMessage ? <p className="mt-2 text-xs text-gray-300">{bulkMessage}</p> : null}
          <div className="mt-4 border-t border-gray-800 pt-3">
            <h3 className="text-sm font-semibold text-amber-200">アーティスト一括補正</h3>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <input
                type="text"
                value={bulkArtist}
                onChange={(e) => setBulkArtist(e.target.value)}
                placeholder="例: Kajagoogoo"
                className="w-56 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-gray-100"
              />
              <select
                value={bulkArtistSource}
                onChange={(e) => setBulkArtistSource(e.target.value)}
                className="w-56 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-gray-100"
              >
                <option value="__all__">対象artist: 全行</option>
                {sourceArtistOptions.map((artist) => (
                  <option key={artist} value={artist}>
                    対象artist: {artist}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void applyArtistBulk()}
                disabled={bulkArtistApplying || bulkArtistTargetSongIds.length === 0}
                className="rounded bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-40"
              >
                {bulkArtistApplying ? '補正中…' : `対象行を一括補正（${bulkArtistTargetSongIds.length}件）`}
              </button>
            </div>
            {bulkArtistMessage ? <p className="mt-2 text-xs text-gray-300">{bulkArtistMessage}</p> : null}
          </div>
        </section>
      ) : null}

      {items.length > 0 ? (
        <section className="mt-6 overflow-x-auto rounded-lg border border-gray-800 bg-gray-900/40">
          <table className="w-full min-w-[1360px] text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800/80">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2">artist</th>
                <th className="px-3 py-2">artist slug</th>
                <th className="px-3 py-2">style</th>
                <th className="px-3 py-2">variant</th>
                <th className="px-3 py-2">title</th>
                <th className="px-3 py-2">videoId</th>
                <th className="px-3 py-2">URL</th>
                <th className="px-3 py-2">原盤公開日</th>
                <th className="px-3 py-2">YouTube公開日</th>
                <th className="px-3 py-2">日付ソース</th>
                <th className="px-3 py-2">ジャンル候補</th>
                <th className="px-3 py-2">再生数</th>
                <th className="px-3 py-2">高評価</th>
                <th className="px-3 py-2">コメント</th>
                <th className="px-3 py-2">Spotify人気度</th>
                <th className="px-3 py-2">Spotify track_id</th>
                <th className="px-3 py-2">Spotify曲名</th>
                <th className="px-3 py-2">Spotifyアーティスト</th>
                <th className="px-3 py-2">Spotifyアルバム</th>
                <th className="px-3 py-2">song_id</th>
                <th className="px-3 py-2">rawTitle</th>
                <th className="px-3 py-2">channelTitle</th>
                <th className="px-3 py-2">error</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={`${row.index}-${row.videoId}`} className="border-b border-gray-800/80 align-top">
                  <td className="px-3 py-2 text-xs text-gray-400">{row.index}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-xs font-medium ${statusClass(row.status)}`}>
                    {statusLabel(row.status)}
                  </td>
                  <td className="px-3 py-2 text-gray-200">{row.artist}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-violet-200">
                    {row.music8ArtistSlug ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-300">{row.style ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-300">{row.variant}</td>
                  <td className="px-3 py-2 text-gray-100">{row.title}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-400">{row.videoId}</td>
                  <td className="px-3 py-2 text-xs">
                    <a href={row.url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
                      YouTube
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-300">{row.originalReleaseDate ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-400">{row.youtubePublishedAt ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-300">{row.dateSource}</td>
                  <td className="max-w-[220px] px-3 py-2 text-xs text-gray-300">
                    {Array.isArray(row.genres) && row.genres.length > 0 ? row.genres.join(', ') : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-300">{formatCount(row.viewCount)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-300">{formatCount(row.likeCount)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-300">{formatCount(row.commentCount)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-300">{row.spotifyPopularity ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-300">
                    {row.spotifyTrackId ?? '—'}
                  </td>
                  <td className="max-w-[220px] px-3 py-2 text-xs text-gray-300">{row.spotifyName ?? '—'}</td>
                  <td className="max-w-[220px] px-3 py-2 text-xs text-gray-300">{row.spotifyArtists ?? '—'}</td>
                  <td className="max-w-[220px] px-3 py-2 text-xs text-gray-300">
                    {row.spotifyUrl ? (
                      <a href={row.spotifyUrl} target="_blank" rel="noreferrer" className="text-emerald-300 hover:underline">
                        {row.spotifyAlbum ?? 'Spotify'}
                      </a>
                    ) : (
                      row.spotifyAlbum ?? '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.songId ? (
                      <Link href={`/admin/songs/${row.songId}`} className="font-mono text-amber-200 hover:underline">
                        {row.songId}
                      </Link>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="max-w-[280px] px-3 py-2 text-xs text-gray-400">{row.rawTitle || '—'}</td>
                  <td className="max-w-[220px] px-3 py-2 text-xs text-gray-400">{row.channelTitle || '—'}</td>
                  <td className="max-w-[260px] px-3 py-2 text-xs text-red-300">{row.error ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
