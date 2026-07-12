'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  songId: string;
  initialDisplayTitle: string | null;
  initialMainArtist: string | null;
  initialSongTitle: string | null;
  initialSongTitleJa: string | null;
  initialStyle: string | null;
  initialOriginalReleaseDate: string | null;
};

export function AdminSongBasicInfoEditPanel({
  songId,
  initialDisplayTitle,
  initialMainArtist,
  initialSongTitle,
  initialSongTitleJa,
  initialStyle,
  initialOriginalReleaseDate,
}: Props) {
  const router = useRouter();
  const [displayTitle, setDisplayTitle] = useState(initialDisplayTitle ?? '');
  const [mainArtist, setMainArtist] = useState(initialMainArtist ?? '');
  const [songTitle, setSongTitle] = useState(initialSongTitle ?? '');
  const [songTitleJa, setSongTitleJa] = useState(initialSongTitleJa ?? '');
  const [style, setStyle] = useState(initialStyle ?? '');
  const [originalReleaseDate, setOriginalReleaseDate] = useState(initialOriginalReleaseDate ?? '');
  const [busy, setBusy] = useState(false);
  const [mbBusy, setMbBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setDisplayTitle(initialDisplayTitle ?? '');
    setMainArtist(initialMainArtist ?? '');
    setSongTitle(initialSongTitle ?? '');
    setSongTitleJa(initialSongTitleJa ?? '');
    setStyle(initialStyle ?? '');
    setOriginalReleaseDate(initialOriginalReleaseDate ?? '');
  }, [
    initialDisplayTitle,
    initialMainArtist,
    initialSongTitle,
    initialSongTitleJa,
    initialStyle,
    initialOriginalReleaseDate,
  ]);

  async function handleMbLookup() {
    const artist = mainArtist.trim();
    const title = songTitle.trim();
    if (!artist || !title) {
      setMsg('MusicBrainz 取得にはメインアーティストと曲タイトルが必要です。');
      return;
    }
    setMbBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/song-musicbrainz-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistName: artist, songTitle: title }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        originalReleaseDate?: string | null;
        songTitleJa?: string | null;
        mbArtist?: string;
        mbSongTitle?: string;
        recordingScore?: number;
        lookupSongTitle?: string;
        foundReleaseDate?: boolean;
        foundSongTitleJa?: boolean;
      };
      if (!res.ok) {
        setMsg(data.error ?? 'MusicBrainz 取得に失敗しました。');
        return;
      }

      const parts: string[] = [];
      const date = data.originalReleaseDate?.trim() ?? '';
      const ja = data.songTitleJa?.trim() ?? '';

      if (date) {
        if (originalReleaseDate.trim() && originalReleaseDate.trim() !== date) {
          const ok = window.confirm(
            `既存の原盤日 ${originalReleaseDate} を ${date} で上書きしますか？`,
          );
          if (ok) {
            setOriginalReleaseDate(date);
            parts.push(`原盤日 ${date}`);
          } else {
            parts.push(`原盤日候補 ${date}（未反映）`);
          }
        } else {
          setOriginalReleaseDate(date);
          parts.push(`原盤日 ${date}`);
        }
      }

      if (ja) {
        if (!songTitleJa.trim()) {
          setSongTitleJa(ja);
          parts.push(`日本語読み ${ja}`);
        } else if (songTitleJa.trim() !== ja) {
          const ok = window.confirm(
            `既存の日本語読み「${songTitleJa}」を「${ja}」で上書きしますか？`,
          );
          if (ok) {
            setSongTitleJa(ja);
            parts.push(`日本語読み ${ja}`);
          } else {
            parts.push(`日本語読み候補 ${ja}（未反映）`);
          }
        } else {
          parts.push(`日本語読み ${ja}`);
        }
      }

      if (parts.length === 0) {
        setMsg(
          `recording は見つかりましたが原盤日・日本語読みはありません（MB: ${data.mbArtist ?? '?'} - ${data.mbSongTitle ?? '?'}）`,
        );
        return;
      }

      const lookupNote =
        data.lookupSongTitle && data.lookupSongTitle !== title
          ? ` / 検索曲名: ${data.lookupSongTitle}`
          : '';
      setMsg(
        `取得: ${parts.join(' · ')}（MB: ${data.mbArtist ?? ''} - ${data.mbSongTitle ?? ''}, score ${data.recordingScore ?? '?'}${lookupNote}）`,
      );
    } catch {
      setMsg('MusicBrainz 取得に失敗しました。');
    } finally {
      setMbBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/song-master-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId,
          displayTitle,
          mainArtist,
          songTitle,
          songTitleJa,
          style,
          originalReleaseDate,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(data.error || '保存に失敗しました。');
        return;
      }
      setMsg('保存しました。');
      router.refresh();
    } catch {
      setMsg('保存に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded border border-emerald-900/50 bg-emerald-950/15 p-3">
      <h3 className="text-sm font-semibold text-emerald-200">基本情報の修正（songs）</h3>
      <p className="mt-2 text-xs text-gray-400">
        display_title / メインアーティスト / 曲タイトル / 日本語読み（song_title_ja） / スタイル /
        original_release_date（原盤）を更新します。
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-gray-400">
          display_title
          <input
            type="text"
            value={displayTitle}
            onChange={(e) => setDisplayTitle(e.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-emerald-700 focus:outline-none"
          />
        </label>
        <label className="block text-xs text-gray-400">
          メインアーティスト
          <input
            type="text"
            value={mainArtist}
            onChange={(e) => setMainArtist(e.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-emerald-700 focus:outline-none"
          />
        </label>
        <label className="block text-xs text-gray-400">
          曲タイトル
          <input
            type="text"
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-emerald-700 focus:outline-none"
          />
        </label>
        <label className="block text-xs text-gray-400">
          日本語読み（song_title_ja）
          <input
            type="text"
            value={songTitleJa}
            onChange={(e) => setSongTitleJa(e.target.value)}
            placeholder="例: レモン"
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-emerald-700 focus:outline-none"
          />
          <span className="mt-1 block text-[11px] text-gray-500">
            ライブラリ検索用。英語タイトルのカタカナ読みなど。
          </span>
        </label>
        <label className="block text-xs text-gray-400">
          スタイル
          <input
            type="text"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-emerald-700 focus:outline-none"
          />
        </label>
        <label className="block text-xs text-gray-400 sm:col-span-2">
          original_release_date（原盤）
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={originalReleaseDate}
              onChange={(e) => setOriginalReleaseDate(e.target.value)}
              className="min-w-[12rem] flex-1 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-emerald-700 focus:outline-none"
            />
            <button
              type="button"
              disabled={mbBusy || busy || !mainArtist.trim() || !songTitle.trim()}
              onClick={() => void handleMbLookup()}
              className="rounded border border-sky-700 bg-sky-950/40 px-3 py-1.5 text-xs text-sky-100 hover:bg-sky-900/50 disabled:opacity-40"
            >
              {mbBusy ? 'MB取得中…' : 'MusicBrainz から取得'}
            </button>
          </div>
          <span className="mt-1 block text-[11px] text-gray-500">
            原盤日と日本語読み（aliases）を取得。括弧付きタイトルは短縮名でも再検索します。
          </span>
        </label>
      </div>

      {msg ? (
        <p className="mt-2 text-xs text-emerald-300" role="status">
          {msg}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void handleSave()}
        className="mt-3 rounded bg-emerald-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? '保存中…' : '基本情報を保存'}
      </button>
    </div>
  );
}
