'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { getArtistDisplayString } from '@/lib/format-song-display';
import {
  MUSIC8_NAV_STYLE_LABELS,
  MUSIC8_NAV_STYLE_SLUGS,
  youtubeVideoIdFromUnknown,
} from '@/lib/music8-catalog-slugs';
import type { AdminSongsRegisterResponse } from '@/lib/admin-songs-register-types';
import type { ExistingSongMatchCandidate } from '@/lib/admin-new-song-existing-match';
import type { AlternatePvMatchLevel } from '@/lib/song-alternate-pv-match';

type RegisterBusyMode = 'stay' | 'detail';

const ATTACH_VARIANT_OPTIONS = ['official', 'visualizer', 'lyric', 'live', 'topic', 'other'] as const;

function levelLabel(level: AlternatePvMatchLevel): string {
  if (level === 'high') return '同一曲（高）';
  if (level === 'medium') return '同一曲の可能性（中）';
  if (level === 'low') return '別曲の可能性あり（低）';
  return '除外';
}

export function AdminNewSongForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialYoutube = params.get('youtube_id') ?? params.get('youtubeId') ?? '';
  const initialArtistRaw = params.get('artist') ?? '';
  const initialArtist = getArtistDisplayString(initialArtistRaw) || initialArtistRaw;
  const initialTitle = params.get('title') ?? '';
  const fromYoutube = params.get('from') === 'youtube';

  const [youtubeId, setYoutubeId] = useState(initialYoutube);
  const [artist, setArtist] = useState(initialArtist);
  const [title, setTitle] = useState(initialTitle);
  const [style, setStyle] = useState('pop');
  const [ytPublishedAt, setYtPublishedAt] = useState<string | null>(null);
  const [suggestedVariant, setSuggestedVariant] = useState<string | null>(null);
  const [attachVariant, setAttachVariant] = useState<string>('official');
  const [existingMatches, setExistingMatches] = useState<ExistingSongMatchCandidate[]>([]);
  const [videoAlreadyOnSongId, setVideoAlreadyOnSongId] = useState<string | null>(null);
  const [ytDateBusy, setYtDateBusy] = useState(false);
  const [busyMode, setBusyMode] = useState<RegisterBusyMode | null>(null);
  const [attachBusySongId, setAttachBusySongId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [songId, setSongId] = useState<string | null>(null);
  const busy = busyMode != null;

  const parsedVideoId = useMemo(() => youtubeVideoIdFromUnknown(youtubeId), [youtubeId]);
  const previewUrl = parsedVideoId ? `https://www.youtube.com/watch?v=${parsedVideoId}` : null;
  const hasStrongExisting = existingMatches.some((m) => m.match.level === 'high' || m.match.level === 'medium');

  useEffect(() => {
    if (!parsedVideoId && !artist.trim() && !title.trim()) {
      setYtPublishedAt(null);
      setExistingMatches([]);
      setVideoAlreadyOnSongId(null);
      setSuggestedVariant(null);
      setYtDateBusy(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setYtDateBusy(true);
      void (async () => {
        try {
          const qs = new URLSearchParams();
          if (parsedVideoId) qs.set('youtube_id', parsedVideoId);
          if (artist.trim()) qs.set('artist', artist.trim());
          if (title.trim()) qs.set('title', title.trim());
          const res = await fetch(`/api/admin/songs-register?${qs.toString()}`, {
            credentials: 'include',
          });
          const data = (await res.json().catch(() => ({}))) as AdminSongsRegisterResponse & {
            maxSongVideoVariants?: number;
          };
          if (cancelled) return;
          setYtPublishedAt(typeof data.youtubePublishedAt === 'string' ? data.youtubePublishedAt : null);
          const sug = typeof data.suggestedVariant === 'string' ? data.suggestedVariant : null;
          setSuggestedVariant(sug);
          if (sug) setAttachVariant(sug);
          setExistingMatches(Array.isArray(data.existingMatches) ? data.existingMatches : []);
          setVideoAlreadyOnSongId(
            typeof data.videoAlreadyOnSongId === 'string' ? data.videoAlreadyOnSongId : null,
          );
        } catch {
          if (!cancelled) {
            setYtPublishedAt(null);
            setExistingMatches([]);
            setVideoAlreadyOnSongId(null);
            setSuggestedVariant(null);
          }
        } finally {
          if (!cancelled) setYtDateBusy(false);
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [parsedVideoId, artist, title]);

  async function registerSong(mode: RegisterBusyMode) {
    setBusyMode(mode);
    setMsg(null);
    setSongId(null);
    try {
      const res = await fetch('/api/admin/songs-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          youtube_id: youtubeId,
          artist,
          title,
          style,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as AdminSongsRegisterResponse;
      if (!res.ok) {
        setMsg(data.error || '登録に失敗しました。');
        return;
      }
      const registeredId = typeof data.songId === 'string' ? data.songId : null;
      setSongId(registeredId);
      if (data.youtubePublishedAt) setYtPublishedAt(data.youtubePublishedAt);
      setExistingMatches([]);
      if (mode === 'detail' && registeredId) {
        router.push(`/admin/songs/${registeredId}`);
        return;
      }
      const extra = data.exportSkipped
        ? ' JSON 増分はスキップ（出力先未設定または失敗）。'
        : data.exportPath
          ? ' JSON を書き出しました。'
          : '';
      const dateNote = data.youtubePublishedAt
        ? ` YouTube 公開日 ${data.youtubePublishedAt} を保存しました。`
        : ' YouTube 公開日は取得できませんでした。';
      setMsg(`登録しました。${dateNote}${extra}`);
    } catch {
      setMsg('登録に失敗しました。');
    } finally {
      setBusyMode(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await registerSong('stay');
  }

  async function attachAsAlternatePv(candidate: ExistingSongMatchCandidate) {
    if (!parsedVideoId) {
      setMsg('YouTube ID が必要です。');
      return;
    }
    setAttachBusySongId(candidate.songId);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/song-alternate-pv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          songId: candidate.songId,
          url: parsedVideoId,
          action: 'add',
          variant: attachVariant || suggestedVariant || 'official',
          force: candidate.match.level === 'medium',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        added?: boolean;
        suggestedVariant?: string;
        backfilledVariants?: { videoId: string; from: string | null; to: string }[];
      };
      if (!res.ok) {
        setMsg(data.error || '別 PV の追記に失敗しました。');
        return;
      }
      setSongId(candidate.songId);
      setMsg(data.message || '既存曲に別バージョンとして追記しました。');
      setExistingMatches((prev) =>
        prev.map((m) =>
          m.songId === candidate.songId
            ? {
                ...m,
                alreadyHasVideo: true,
                videoCount: m.alreadyHasVideo ? m.videoCount : m.videoCount + 1,
                videoIds: m.videoIds.includes(parsedVideoId)
                  ? m.videoIds
                  : [...m.videoIds, parsedVideoId],
              }
            : m,
        ),
      );
      setVideoAlreadyOnSongId(candidate.songId);
    } catch {
      setMsg('別 PV の追記に失敗しました。');
    } finally {
      setAttachBusySongId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <AdminMenuBar />
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-xl font-semibold text-amber-100">洋楽 1 曲登録</h1>
        <p className="mt-2 text-sm text-gray-400">
          YouTube から 1 回で MusicAiChat の Supabase に書き込み、Music8 公開用 JSON を増分出力します。
          {fromYoutube ? ' （Chrome 拡張 YT to M7 から開きました）' : ''}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          WordPress 新規投稿（YT to WP）は並行期のみ。新規はこちらを正とします。
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm">
            YouTube ID / URL
            <input
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2"
              value={youtubeId}
              onChange={(e) => setYoutubeId(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            アーティスト
            <input
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            曲名
            <input
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <fieldset className="text-sm">
            <legend className="text-sm text-gray-100">スタイル（Music8 ナビ）</legend>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-2">
              {MUSIC8_NAV_STYLE_SLUGS.map((s) => (
                <label
                  key={s}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1.5 text-sm ${
                    style === s
                      ? 'border-amber-600 bg-amber-950/40 text-amber-100'
                      : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="music8-nav-style"
                    value={s}
                    checked={style === s}
                    onChange={() => setStyle(s)}
                    className="accent-amber-500"
                  />
                  {MUSIC8_NAV_STYLE_LABELS[s]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="text-sm">
            <p className="text-gray-300">公開日（YouTube）</p>
            <p className="mt-1 rounded border border-gray-800 bg-gray-900 px-3 py-2 font-mono text-sm text-gray-100">
              {ytDateBusy ? '取得中…' : ytPublishedAt ?? '未取得'}
            </p>
            <p className="mt-1 text-[11px] text-gray-500">
              登録時に YouTube の動画公開日を保存します（原盤日が空なら仮の公開日にも使います）。正確な原盤日は曲詳細の「MusicBrainz から取得」で再取得できます。
            </p>
          </div>
          {previewUrl ? (
            <p className="text-xs">
              <a className="text-sky-400 hover:underline" href={previewUrl} target="_blank" rel="noreferrer">
                YouTube で開く
              </a>
              {suggestedVariant ? (
                <span className="ml-2 text-gray-500">推定 variant: {suggestedVariant}</span>
              ) : null}
            </p>
          ) : null}

          {videoAlreadyOnSongId ? (
            <div className="rounded border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
              この video_id は既に曲に登録済みです。{' '}
              <Link className="text-sky-300 hover:underline" href={`/admin/songs/${videoAlreadyOnSongId}`}>
                曲詳細を開く
              </Link>
            </div>
          ) : null}

          {hasStrongExisting ? (
            <div className="rounded border border-sky-800/70 bg-sky-950/25 p-3">
              <p className="text-sm font-medium text-sky-100">既存曲の候補があります</p>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                Visualizer / Official Video などバージョン違いは、曲名ではなく{' '}
                <span className="font-mono text-gray-300">song_videos.variant</span>{' '}
                で区別します。追記時に新規 PV の variant（例: official）を付け、既存 PV
                が未設定／雑な既定なら YouTube タイトルから Visualizer 等を自動補完します。
              </p>
              {hasStrongExisting ? (
                <label className="mt-2 block text-[11px] text-gray-400">
                  追記する PV の variant
                  <select
                    value={attachVariant}
                    onChange={(e) => setAttachVariant(e.target.value)}
                    className="mt-1 w-full max-w-xs rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white"
                  >
                    {ATTACH_VARIANT_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <ul className="mt-3 space-y-3">
                {existingMatches.map((m) => (
                  <li
                    key={m.songId}
                    className="rounded border border-gray-800 bg-gray-950/80 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-medium text-gray-100">
                        {m.displayTitle || `${m.mainArtist ?? ''} - ${m.songTitle ?? ''}`}
                      </span>
                      <span className="text-[11px] text-sky-300">{levelLabel(m.match.level)}</span>
                      <span className="text-[11px] text-gray-500">
                        PV {m.videoCount} 本{m.atCap ? '（上限）' : ''}
                      </span>
                    </div>
                    {m.match.reasons.length > 0 ? (
                      <p className="mt-1 text-[11px] text-gray-500">{m.match.reasons.join(' · ')}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link
                        className="rounded border border-gray-600 px-2 py-1 text-xs text-sky-300 hover:border-sky-600"
                        href={`/admin/songs/${m.songId}`}
                      >
                        曲詳細
                      </Link>
                      {m.alreadyHasVideo ? (
                        <span className="rounded border border-emerald-800 px-2 py-1 text-xs text-emerald-200">
                          この PV は登録済み
                        </span>
                      ) : m.atCap ? (
                        <span className="rounded border border-amber-800 px-2 py-1 text-xs text-amber-200">
                          PV 上限のため追記不可
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={attachBusySongId === m.songId || !parsedVideoId}
                          onClick={() => void attachAsAlternatePv(m)}
                          className="rounded bg-sky-700 px-2 py-1 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-50"
                        >
                          {attachBusySongId === m.songId ? '追記中…' : 'この曲に別 PV として追記'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : ytDateBusy && artist.trim() && title.trim() ? (
            <p className="text-xs text-gray-500">既存曲を確認中…</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || Boolean(videoAlreadyOnSongId)}
              className={
                hasStrongExisting
                  ? 'rounded border border-gray-600 bg-gray-900 px-4 py-2 text-sm font-medium text-gray-300 hover:border-gray-500 disabled:opacity-50'
                  : 'rounded bg-amber-600 px-4 py-2 text-sm font-medium text-black hover:bg-amber-500 disabled:opacity-50'
              }
            >
              {busyMode === 'stay'
                ? '登録中…'
                : hasStrongExisting
                  ? 'それでも新規として登録'
                  : 'Supabase に登録'}
            </button>
            <button
              type="button"
              disabled={busy || Boolean(videoAlreadyOnSongId)}
              onClick={() => void registerSong('detail')}
              className={
                hasStrongExisting
                  ? 'rounded border border-amber-700/70 bg-amber-950/40 px-4 py-2 text-sm font-medium text-amber-100 hover:border-amber-500 disabled:opacity-50'
                  : 'rounded border border-amber-500 bg-amber-950/50 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-900/60 disabled:opacity-50'
              }
            >
              {busyMode === 'detail'
                ? '登録して詳細へ…'
                : hasStrongExisting
                  ? 'それでも登録して詳細へ'
                  : 'Supabase に登録 / 詳細へ'}
            </button>
          </div>
          {hasStrongExisting ? (
            <p className="text-[11px] text-gray-500">
              表示名が既存と同じ場合、裏の upsert で既存曲に紐づくことがあります。バージョン違いは上の「別 PV
              として追記」を推奨します。
            </p>
          ) : null}
        </form>

        {msg ? <p className="mt-4 text-sm text-amber-200">{msg}</p> : null}
        {songId ? (
          <p className="mt-2 text-sm">
            <Link className="text-sky-400 hover:underline" href={`/admin/songs/${songId}`}>
              曲詳細を開く
            </Link>
            <span className="mx-2 text-gray-600">·</span>
            <Link className="text-sky-400 hover:underline" href="/admin/songs/list">
              登録曲一覧
            </Link>
          </p>
        ) : null}
        <p className="mt-8 text-sm">
          <Link className="text-gray-400 hover:underline" href="/admin/songs/list">
            登録曲一覧へ
          </Link>
          <span className="mx-2 text-gray-600">·</span>
          <Link className="text-gray-400 hover:underline" href="/admin/songs">
            曲ダッシュボードへ戻る
          </Link>
        </p>
      </main>
    </div>
  );
}
