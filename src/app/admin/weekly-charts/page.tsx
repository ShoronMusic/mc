'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import type { WeeklyChartEntryView, WeeklyChartIssueView, WeeklyChartRegion } from '@/lib/weekly-charts';

type FilterKey = 'all' | 'new' | 'existing';

function matchKindLabel(kind: WeeklyChartEntryView['matchKind']): string {
  if (kind === 'spotify_id') return '登録済み（Spotify ID）';
  if (kind === 'artist_title') return '登録済み（曲名・アーティスト）';
  return '未登録（新規）';
}

function matchKindClass(kind: WeeklyChartEntryView['matchKind']): string {
  if (kind === 'none') return 'bg-amber-950/70 text-amber-200 ring-1 ring-amber-800';
  if (kind === 'spotify_id') return 'bg-emerald-950/70 text-emerald-200 ring-1 ring-emerald-800';
  return 'bg-sky-950/70 text-sky-200 ring-1 ring-sky-800';
}

function regionTitle(region: WeeklyChartRegion): string {
  return region === 'us' ? 'US（火曜公開）' : 'UK（金曜公開）';
}

function visibleEntries(issue: WeeklyChartIssueView, filter: FilterKey): WeeklyChartEntryView[] {
  if (filter === 'new') return issue.entries.filter((e) => e.matchKind === 'none');
  if (filter === 'existing') return issue.entries.filter((e) => e.matchKind !== 'none');
  return issue.entries;
}

function ChartEntryRow({
  entry,
  binding,
  onBind,
}: {
  entry: WeeklyChartEntryView;
  binding: boolean;
  onBind: (entryId: string, target: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const canBind = Boolean(entry.id);
  const others = (entry.candidateSongs ?? []).filter((c) => c.songId !== entry.songId);

  const applyBind = async (value: string) => {
    if (!entry.id || !value.trim() || binding) return;
    const ok = await onBind(entry.id, value.trim());
    if (!ok) return;
    setTarget('');
    setOpen(false);
  };

  return (
    <li className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-100">
            <span className="mr-2 tabular-nums text-gray-500">{entry.position}.</span>
            <span className="font-medium">{entry.artistName}</span>
            <span className="text-gray-500"> — </span>
            {entry.title}
          </p>
          {entry.spotifyArtists && entry.spotifyArtists !== entry.artistName ? (
            <p className="mt-0.5 truncate text-xs text-gray-500">{entry.spotifyArtists}</p>
          ) : null}
          {entry.matchKind !== 'none' && entry.songDisplayTitle ? (
            <p className="mt-0.5 truncate text-xs text-gray-400">DB: {entry.songDisplayTitle}</p>
          ) : null}
          {entry.matchKind !== 'none' ? (
            <p className="mt-0.5 truncate text-xs text-gray-500 tabular-nums">
              PV: {entry.youtubeVideoId ?? 'なし'}
            </p>
          ) : null}
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] ${matchKindClass(entry.matchKind)}`}>
          {matchKindLabel(entry.matchKind)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <a
          href={entry.youtubeSearchUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded border border-gray-700 px-2 py-0.5 text-sky-300 hover:bg-gray-800"
        >
          YouTube検索
        </a>
        {entry.youtubeWatchUrl ? (
          <a
            href={entry.youtubeWatchUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-gray-700 px-2 py-0.5 text-sky-300 hover:bg-gray-800"
          >
            YouTubeを開く
          </a>
        ) : null}
        {entry.spotifyUrl ? (
          <a
            href={entry.spotifyUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-gray-700 px-2 py-0.5 text-gray-300 hover:bg-gray-800"
          >
            Spotify
          </a>
        ) : null}
        {entry.matchKind === 'none' ? (
          <Link
            href={entry.newSongHref}
            target="_blank"
            className="rounded border border-amber-800 px-2 py-0.5 text-amber-200 hover:bg-amber-950/40"
          >
            1曲登録
          </Link>
        ) : entry.songAdminHref ? (
          <Link
            href={entry.songAdminHref}
            target="_blank"
            className="rounded border border-gray-700 px-2 py-0.5 text-amber-200/90 hover:bg-gray-800"
          >
            曲詳細
          </Link>
        ) : null}
        {canBind ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded border border-gray-700 px-2 py-0.5 text-gray-200 hover:bg-gray-800"
          >
            {open ? '閉じる' : 'PVを変更'}
          </button>
        ) : null}
      </div>
      {open && canBind && entry.id ? (
        <div className="mt-2 space-y-2 rounded border border-gray-800 bg-gray-900/70 p-2">
          <p className="text-[11px] text-gray-400">
            いまの公開 PV は上の ID です。別曲の公式 MV にしたいときは、下の別登録を選ぶか YouTube URL を貼ってください。
          </p>
          {others.length > 0 ? (
            <ul className="space-y-1">
              {others.map((c) => (
                <li key={c.songId} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="shrink-0 text-gray-500">別登録</span>
                  <span className="min-w-0 flex-1 truncate text-gray-300">{c.songDisplayTitle}</span>
                  {c.youtubeWatchUrl ? (
                    <a
                      href={c.youtubeWatchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-300 hover:underline"
                    >
                      開く
                    </a>
                  ) : (
                    <span className="text-gray-600">PVなし</span>
                  )}
                  <button
                    type="button"
                    disabled={binding}
                    onClick={() => void applyBind(c.songId)}
                    className="rounded border border-emerald-800 px-2 py-0.5 text-emerald-200 hover:bg-emerald-950/40 disabled:opacity-50"
                  >
                    この曲にする
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-gray-500">同じ曲名の別登録は見つかりませんでした。YouTube URL を貼っても差し替えできます。</p>
          )}
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              void applyBind(target);
            }}
          >
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="YouTube URL または曲 UUID"
              className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100"
            />
            <button
              type="submit"
              disabled={binding || !target.trim()}
              className="rounded bg-emerald-800 px-2 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {binding ? '変更中…' : '差し替え'}
            </button>
          </form>
        </div>
      ) : null}
    </li>
  );
}

function ChartPanel({
  region,
  issue,
  importing,
  bindingEntryId,
  onImport,
  onBind,
}: {
  region: WeeklyChartRegion;
  issue: WeeklyChartIssueView | null;
  importing: boolean;
  bindingEntryId: string | null;
  onImport: (region: WeeklyChartRegion) => void;
  onBind: (entryId: string, target: string) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const rows = issue ? visibleEntries(issue, filter) : [];

  return (
    <section className="rounded border border-gray-700 bg-gray-900/50 p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">{regionTitle(region)}</h2>
          {issue ? (
            <p className="mt-1 text-xs text-gray-400 tabular-nums">
              チャート週 {issue.chartWeek}
              {issue.playlistName ? ` · ${issue.playlistName}` : ''}
              {' · '}
              登録済み {issue.existingCount} · 新規 {issue.newCount}
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">まだ取り込んでいません。</p>
          )}
        </div>
        <button
          type="button"
          disabled={importing}
          onClick={() => onImport(region)}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
        >
          {importing ? '取込中…' : '今週を取り込む'}
        </button>
      </div>

      {issue ? (
        <>
          <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="新規／登録済み">
            {(
              [
                ['all', `すべて ${issue.entries.length}`],
                ['new', `新規 ${issue.newCount}`],
                ['existing', `登録済み ${issue.existingCount}`],
              ] as Array<[FilterKey, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={
                  filter === key
                    ? 'rounded-full bg-emerald-900/50 px-3 py-1 text-xs font-medium text-emerald-100 ring-1 ring-emerald-700/60'
                    : 'rounded-full px-3 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }
              >
                {label}
              </button>
            ))}
          </div>
          <ol className="space-y-2">
            {rows.map((entry) => (
              <ChartEntryRow
                key={entry.id ?? `${entry.position}-${entry.spotifyTrackId}`}
                entry={entry}
                binding={bindingEntryId === entry.id}
                onBind={onBind}
              />
            ))}
          </ol>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">この絞り込みに該当する曲はありません。</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export default function AdminWeeklyChartsPage() {
  const [us, setUs] = useState<WeeklyChartIssueView | null>(null);
  const [uk, setUk] = useState<WeeklyChartIssueView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<WeeklyChartRegion | null>(null);
  const [bindingEntryId, setBindingEntryId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/weekly-charts', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '読み込みに失敗しました。');
        setUs(null);
        setUk(null);
        return;
      }
      setUs(data.us ?? null);
      setUk(data.uk ?? null);
    } catch {
      setError('読み込みに失敗しました。');
      setUs(null);
      setUk(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runImport = async (region: WeeklyChartRegion) => {
    setImporting(region);
    setError(null);
    try {
      const res = await fetch('/api/admin/weekly-charts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '取込に失敗しました。');
        return;
      }
      const issue = data.issue as WeeklyChartIssueView | undefined;
      if (issue?.region === 'us') setUs(issue);
      if (issue?.region === 'uk') setUk(issue);
    } catch {
      setError('取込に失敗しました。');
    } finally {
      setImporting(null);
    }
  };

  const bindEntry = async (entryId: string, target: string): Promise<boolean> => {
    setBindingEntryId(entryId);
    setError(null);
    try {
      const res = await fetch('/api/admin/weekly-charts', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '紐づけの変更に失敗しました。');
        return false;
      }
      const issue = data.issue as WeeklyChartIssueView | undefined;
      if (issue?.region === 'us') setUs(issue);
      if (issue?.region === 'uk') setUk(issue);
      return true;
    } catch {
      setError('紐づけの変更に失敗しました。');
      return false;
    } finally {
      setBindingEntryId(null);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-4xl">
        <AdminMenuBar />
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <h1 className="text-xl font-semibold sm:text-2xl">週間チャート</h1>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || importing != null}
            className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? '照合中…' : '再照合'}
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-400">
          Spotify 公式プレイリストの上位 10 曲を取り込み、取込時点で既存登録曲と新規を分けます。既存曲は上書きせず紐づけのみ。公開の PV
          は紐づいた曲の代表 YouTube（公式優先）です。別の PV にしたいときは行の「PVを変更」から、その YouTube が載っている曲へ差し替えてください。新規は
          YouTube 検索 → 1曲登録のあと「再照合」してください。
        </p>
        {error ? (
          <p className="mb-4 rounded border border-amber-800 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
            {error}
          </p>
        ) : null}
        <div className="space-y-6">
          <ChartPanel
            region="us"
            issue={us}
            importing={importing === 'us'}
            bindingEntryId={bindingEntryId}
            onImport={(r) => void runImport(r)}
            onBind={bindEntry}
          />
          <ChartPanel
            region="uk"
            issue={uk}
            importing={importing === 'uk'}
            bindingEntryId={bindingEntryId}
            onImport={(r) => void runImport(r)}
            onBind={bindEntry}
          />
        </div>
      </div>
    </main>
  );
}
