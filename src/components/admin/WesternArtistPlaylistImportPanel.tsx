'use client';

import { useCallback, useState } from 'react';
import {
  formatPlaylistArtistsField,
  parsePlaylistArtistsField,
} from '@/lib/admin-domestic-playlist-artists-field';

type PlaylistItem = {
  index: number;
  videoId: string;
  url: string;
  artist: string;
  title: string;
  displayTitle: string;
  rawTitle: string;
  channelTitle: string | null;
  channelId: string | null;
  releaseDate: string | null;
  youtubeDate: string | null;
  genres: string[];
  include: boolean;
  note: string | null;
  artistMatch: 'channel' | 'name' | 'mismatch' | 'unknown';
  officialGate: { persist: boolean; reason: string };
  creditArtists?: string[];
};

type PlaylistSummary = {
  total: number;
  playlistFetched?: number;
  included: number;
  gateOk: number;
  withReleaseDate: number;
  existingVideos: number;
  skippedExisting?: number;
};

type Props = {
  artistName: string;
  nameEn?: string | null;
  youtubeChannelId?: string | null;
  onImported?: () => void;
};

const inputClass =
  'w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-gray-100';

/**
 * 洋楽アーティスト情報ページ用 — YouTube プレイリストから曲を一括登録。
 */
export function WesternArtistPlaylistImportPanel({
  artistName,
  nameEn,
  youtubeChannelId,
  onImported,
}: Props) {
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistMaxItems, setPlaylistMaxItems] = useState(30);
  const [playlistForceAllow, setPlaylistForceAllow] = useState(false);
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([]);
  const [playlistSummary, setPlaylistSummary] = useState<PlaylistSummary | null>(null);
  const [fetching, setFetching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const patchItem = useCallback((index: number, patch: Partial<PlaylistItem>) => {
    setPlaylistItems((prev) =>
      prev.map((row) => (row.index === index ? { ...row, ...patch } : row)),
    );
  }, []);

  const patchArtistsField = useCallback((index: number, raw: string) => {
    const { mainArtist, creditArtists } = parsePlaylistArtistsField(raw);
    setPlaylistItems((prev) =>
      prev.map((row) =>
        row.index === index
          ? {
              ...row,
              artist: mainArtist,
              creditArtists,
              displayTitle: mainArtist && row.title ? `${mainArtist} - ${row.title}` : row.displayTitle,
            }
          : row,
      ),
    );
  }, []);

  async function runFetch(): Promise<void> {
    const name = artistName.trim();
    if (!name) {
      setError('アーティスト名がありません。');
      return;
    }
    if (!playlistUrl.trim()) {
      setError('プレイリスト URL を入力してください。');
      return;
    }
    setFetching(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/western-artist-profile/playlist-fetch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistUrl: playlistUrl.trim(),
          maxItems: playlistMaxItems,
          artistName: name,
          nameEn: nameEn ?? null,
          youtubeChannelId: youtubeChannelId ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: PlaylistItem[];
        summary?: PlaylistSummary;
      };
      if (!res.ok) {
        setError(data.error ?? 'プレイリスト取得に失敗しました。');
        return;
      }
      setPlaylistItems(Array.isArray(data.items) ? data.items : []);
      setPlaylistSummary(data.summary ?? null);
      const skipped = data.summary?.skippedExisting ?? data.summary?.existingVideos ?? 0;
      setMessage(
        `未登録 ${data.summary?.total ?? 0} 件（PL走査 ${data.summary?.playlistFetched ?? 0} / 既存スキップ ${skipped} / 投入候補 ${data.summary?.included ?? 0}）。`,
      );
    } catch {
      setError('プレイリスト取得に失敗しました。');
    } finally {
      setFetching(false);
    }
  }

  async function runApply(dryRun: boolean): Promise<void> {
    if (!playlistItems.length) {
      setError('先にプレイリストを取得してください。');
      return;
    }
    setApplying(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/western-artist-profile/playlist-apply', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun,
          forceAllow: playlistForceAllow,
          artistName: artistName.trim() || null,
          items: playlistItems.map((item) => ({
            videoId: item.videoId,
            artist: item.artist,
            title: item.title,
            displayTitle: item.displayTitle,
            releaseDate: item.releaseDate,
            youtubeDate: item.youtubeDate,
            genres: item.genres,
            include: item.include,
            rawTitle: item.rawTitle,
            channelTitle: item.channelTitle,
            channelId: item.channelId,
            creditArtists: item.creditArtists ?? [],
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        summary?: Record<string, number>;
        dryRun?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? '投入に失敗しました。');
        return;
      }
      const s = data.summary;
      setMessage(
        data.dryRun
          ? `dry-run: 対象 ${s?.dryRun ?? 0} / ゲート除外 ${s?.skippedGate ?? 0} / 除外チェック ${s?.skippedExcluded ?? 0}`
          : `保存完了: 登録 ${s?.imported ?? 0} / 失敗 ${s?.failed ?? 0} / ゲート除外 ${s?.skippedGate ?? 0}`,
      );
      if (!dryRun) {
        setPlaylistItems([]);
        setPlaylistSummary(null);
        if (onImported) onImported();
        else window.location.reload();
      }
    } catch {
      setError('投入に失敗しました。');
    } finally {
      setApplying(false);
    }
  }

  return (
    <section className="mt-6 space-y-3 rounded-lg border border-sky-900/50 bg-sky-950/20 p-4 text-sm">
      <h2 className="text-sm font-semibold text-sky-200">YouTube プレイリストから曲登録（洋楽）</h2>
      <p className="text-xs leading-relaxed text-gray-400">
        このアーティスト名で登録します。既存の video_id は飛ばし、未登録が最大件数に達するまで集めます。
        メタは YouTube＋MusicBrainz（取得できたとき）。保存は洋楽の通常ルート（Music8 / Spotify 補完あり）。
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[16rem] flex-1 text-xs text-gray-400">
          プレイリスト URL
          <input
            className={`${inputClass} mt-1`}
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="https://www.youtube.com/playlist?list=PL..."
          />
        </label>
        <label className="w-28 text-xs text-gray-400">
          未登録の最大件数
          <input
            type="number"
            min={1}
            max={100}
            className={`${inputClass} mt-1`}
            value={playlistMaxItems}
            onChange={(e) => setPlaylistMaxItems(Number(e.target.value) || 10)}
          />
        </label>
        <button
          type="button"
          onClick={() => void runFetch()}
          disabled={fetching || applying}
          className="rounded border border-sky-600/80 bg-sky-900/40 px-4 py-2 text-sm font-medium text-sky-50 hover:bg-sky-800/50 disabled:opacity-40"
        >
          {fetching ? '取得中…' : '1. プレイリスト取得'}
        </button>
      </div>
      {playlistSummary ? (
        <p className="text-xs text-gray-400">
          表 {playlistSummary.total} 件
          {playlistSummary.playlistFetched != null
            ? `（PL読込 ${playlistSummary.playlistFetched}）`
            : ''}{' '}
          / 既存スキップ {playlistSummary.skippedExisting ?? playlistSummary.existingVideos} /
          include {playlistSummary.included} / ゲート OK {playlistSummary.gateOk} / 原盤日あり{' '}
          {playlistSummary.withReleaseDate}
        </p>
      ) : null}
      {playlistItems.length > 0 ? (
        <>
          <div className="max-h-[28rem] overflow-auto rounded border border-gray-800">
            <table className="w-full min-w-[44rem] text-left text-xs">
              <thead className="sticky top-0 bg-gray-900 text-gray-400">
                <tr>
                  <th className="px-2 py-1">#</th>
                  <th className="px-2 py-1">保存</th>
                  <th className="px-2 py-1">videoId</th>
                  <th className="px-2 py-1 min-w-[10rem]">アーティスト</th>
                  <th className="px-2 py-1 min-w-[10rem]">曲名</th>
                  <th className="px-2 py-1">一致</th>
                  <th className="px-2 py-1">ゲート</th>
                  <th className="px-2 py-1">原盤日</th>
                  <th className="px-2 py-1">YT公開日</th>
                </tr>
              </thead>
              <tbody>
                {playlistItems.map((item) => (
                  <tr key={item.videoId} className="border-t border-gray-800/80 align-top">
                    <td className="px-2 py-1 tabular-nums text-gray-500">{item.index}</td>
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={item.include}
                        onChange={(e) => patchItem(item.index, { include: e.target.checked })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[10px] text-sky-300 hover:underline"
                      >
                        {item.videoId}
                      </a>
                      {item.note ? (
                        <p className="mt-0.5 max-w-[8rem] text-[10px] text-amber-200/90">{item.note}</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className="w-full min-w-[9rem] rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-xs text-gray-100"
                        value={formatPlaylistArtistsField(item.artist, item.creditArtists)}
                        onChange={(e) => patchArtistsField(item.index, e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className="w-full min-w-[9rem] rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-xs text-gray-100"
                        value={item.title}
                        onChange={(e) => {
                          const title = e.target.value;
                          patchItem(item.index, {
                            title,
                            displayTitle: item.artist ? `${item.artist} - ${title}` : title,
                          });
                        }}
                      />
                    </td>
                    <td className="px-2 py-1 text-gray-400">{item.artistMatch}</td>
                    <td className="px-2 py-1 text-gray-400" title={item.officialGate.reason}>
                      {item.officialGate.persist ? 'OK' : 'NG'}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className="w-24 rounded border border-gray-700 bg-gray-950 px-1 py-1 text-xs text-gray-100"
                        value={item.releaseDate ?? ''}
                        onChange={(e) =>
                          patchItem(item.index, { releaseDate: e.target.value.trim() || null })
                        }
                        placeholder="YYYY-MM-DD"
                      />
                    </td>
                    <td className="px-2 py-1 text-gray-500">{item.youtubeDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={playlistForceAllow}
              onChange={(e) => setPlaylistForceAllow(e.target.checked)}
            />
            ゲート NG も forceAllow で保存する
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={applying || fetching}
              onClick={() => void runApply(true)}
              className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-40"
            >
              {applying ? '処理中…' : '2. dry-run'}
            </button>
            <button
              type="button"
              disabled={applying || fetching}
              onClick={() => void runApply(false)}
              className="rounded bg-sky-800 px-3 py-1.5 text-xs text-white hover:bg-sky-700 disabled:opacity-40"
            >
              3. DBに保存
            </button>
          </div>
        </>
      ) : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-300/90">{message}</p> : null}
    </section>
  );
}
