'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SONG_STYLE_OPTIONS } from '@/lib/song-styles';
import { SONG_CATALOG_SCOPES, type SongCatalogScope } from '@/lib/song-catalog-scope';
import { AdminSongGenreCheckboxField } from '@/components/admin/AdminSongGenreCheckboxField';
import { AdminArtistPhoto } from '@/components/admin/AdminArtistPhoto';
import { useAdminSongDetailWorkflow } from '@/components/admin/AdminSongDetailWorkflow';
import { isAdminSongBasicInfoFilled } from '@/lib/admin-song-detail-status';
import { uniqueNormalizedGenreNames, type AdminSuggestedGenre } from '@/lib/admin-song-artist-defaults';
import { formatLibraryVocalDisplay } from '@/lib/library-vocal-display';

function vocalFlagsFromRaw(raw: string | null | undefined): { f: boolean; m: boolean } {
  const n = formatLibraryVocalDisplay(raw);
  return { f: n === 'F' || n === 'F,M', m: n === 'M' || n === 'F,M' };
}

function vocalStringFromFlags(f: boolean, m: boolean): string {
  if (f && m) return 'F,M';
  if (f) return 'F';
  if (m) return 'M';
  return '';
}

type Props = {
  songId: string;
  initialDisplayTitle: string | null;
  initialMainArtist: string | null;
  initialSongTitle: string | null;
  initialSongTitleJa: string | null;
  initialStyle: string | null;
  initialOriginalReleaseDate: string | null;
  initialCatalogScope?: string | null;
  initialVocal?: string | null;
  initialGenres?: string[] | null;
  suggestedGenres?: AdminSuggestedGenre[];
  allGenres?: string[];
  artistImageUrl?: string | null;
  vocalFromArtistHistory?: boolean;
  vocalNoArtistHistory?: boolean;
  highlightStyle?: boolean;
};

export function AdminSongBasicInfoEditPanel({
  songId,
  initialDisplayTitle,
  initialMainArtist,
  initialSongTitle,
  initialSongTitleJa,
  initialStyle,
  initialOriginalReleaseDate,
  initialCatalogScope = null,
  initialVocal = null,
  initialGenres = null,
  suggestedGenres = [],
  allGenres = [],
  artistImageUrl = null,
  vocalFromArtistHistory = false,
  vocalNoArtistHistory = false,
  highlightStyle = false,
}: Props) {
  const router = useRouter();
  const workflow = useAdminSongDetailWorkflow();
  const [displayTitle, setDisplayTitle] = useState(initialDisplayTitle ?? '');
  const [mainArtist, setMainArtist] = useState(initialMainArtist ?? '');
  const [songTitle, setSongTitle] = useState(initialSongTitle ?? '');
  const [songTitleJa, setSongTitleJa] = useState(initialSongTitleJa ?? '');
  const [style, setStyle] = useState(initialStyle ?? '');
  const [originalReleaseDate, setOriginalReleaseDate] = useState(initialOriginalReleaseDate ?? '');
  const [catalogScope, setCatalogScope] = useState<SongCatalogScope>(
    initialCatalogScope === 'western' || initialCatalogScope === 'domestic' ? initialCatalogScope : 'unknown',
  );
  const [vocal, setVocal] = useState(() => formatLibraryVocalDisplay(initialVocal) ?? '');
  const [genres, setGenres] = useState<string[]>(uniqueNormalizedGenreNames(initialGenres ?? []));
  const [busy, setBusy] = useState(false);
  const [mbBusy, setMbBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const styleRadioOptions = useMemo(() => {
    const current = style.trim();
    if (current && !(SONG_STYLE_OPTIONS as readonly string[]).includes(current)) {
      return [current, ...SONG_STYLE_OPTIONS];
    }
    return [...SONG_STYLE_OPTIONS];
  }, [style]);

  const vocalFlags = useMemo(() => vocalFlagsFromRaw(vocal), [vocal]);
  const vocalLegacy =
    (initialVocal ?? '').trim() && !formatLibraryVocalDisplay(initialVocal)
      ? (initialVocal ?? '').trim()
      : null;

  useEffect(() => {
    setDisplayTitle(initialDisplayTitle ?? '');
    setMainArtist(initialMainArtist ?? '');
    setSongTitle(initialSongTitle ?? '');
    setSongTitleJa(initialSongTitleJa ?? '');
    setStyle(initialStyle ?? '');
    setOriginalReleaseDate(initialOriginalReleaseDate ?? '');
    setCatalogScope(
      initialCatalogScope === 'western' || initialCatalogScope === 'domestic' ? initialCatalogScope : 'unknown',
    );
    setVocal(formatLibraryVocalDisplay(initialVocal) ?? '');
    setGenres(uniqueNormalizedGenreNames(initialGenres ?? []));
  }, [
    initialDisplayTitle,
    initialMainArtist,
    initialSongTitle,
    initialSongTitleJa,
    initialStyle,
    initialOriginalReleaseDate,
    initialCatalogScope,
    initialVocal,
    initialGenres,
  ]);

  useEffect(() => {
    workflow?.setFilled(
      'basic',
      isAdminSongBasicInfoFilled({
        style,
        vocal,
        originalReleaseDate,
      }),
    );
  }, [workflow, style, vocal, originalReleaseDate]);

  function toggleVocal(which: 'F' | 'M', checked: boolean) {
    setVocal(
      vocalStringFromFlags(which === 'F' ? checked : vocalFlags.f, which === 'M' ? checked : vocalFlags.m),
    );
  }

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

  async function handleSave(): Promise<boolean> {
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
          catalogScope,
          vocal,
          genres,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(data.error || '保存に失敗しました。');
        return false;
      }
      setMsg('保存しました。');
      if (!workflow) router.refresh();
      return true;
    } catch {
      setMsg('保存に失敗しました。');
      return false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!workflow) return;
    workflow.registerAction('basic', handleSave);
    return () => workflow.registerAction('basic', null);
  });

  return (
    <div
      id="style-edit"
      className={`mt-4 scroll-mt-20 rounded border p-3 ${
        highlightStyle
          ? 'border-violet-600/60 bg-violet-950/20 ring-1 ring-violet-700/40'
          : 'border-emerald-900/50 bg-emerald-950/15'
      }`}
    >
      <h3 className="text-sm font-semibold text-emerald-200">基本情報の修正（songs）</h3>
      {highlightStyle ? (
        <p className="mt-1 text-xs text-violet-200">
          プレイリスト取込から開いています。スタイルを選んで上部の「保存」を押してください。
        </p>
      ) : null}
      <p className="mt-2 text-xs text-gray-400">
        正本は <code className="text-gray-500">songs</code> です。公開 Music8 JSON
        から取り込む必要はありません。スタイル・年代・ボーカルはここが優先されます。
        {workflow ? ' 保存は上部バーの「保存」です。' : ''}
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
          <span className="mt-1 flex items-center gap-2">
            <AdminArtistPhoto url={artistImageUrl} name={mainArtist} size={56} />
            <input
              type="text"
              value={mainArtist}
              onChange={(e) => setMainArtist(e.target.value)}
              className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-emerald-700 focus:outline-none"
            />
          </span>
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

        <fieldset className="sm:col-span-2 text-xs text-gray-400">
          <legend className="text-xs text-gray-400">スタイル</legend>
          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-2">
            <label
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-sm ${
                !style.trim()
                  ? 'border-emerald-600 bg-emerald-950/40 text-emerald-100'
                  : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="song-style"
                value=""
                checked={!style.trim()}
                onChange={() => setStyle('')}
                className="accent-emerald-500"
              />
              （未設定）
            </label>
            {styleRadioOptions.map((s) => (
              <label
                key={s}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-sm ${
                  style === s
                    ? 'border-emerald-600 bg-emerald-950/40 text-emerald-100'
                    : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
                }`}
              >
                <input
                  type="radio"
                  name="song-style"
                  value={s}
                  checked={style === s}
                  onChange={() => setStyle(s)}
                  className="accent-emerald-500"
                />
                {s}
                {!(SONG_STYLE_OPTIONS as readonly string[]).includes(s) ? (
                  <span className="text-[10px] text-amber-300/90">既存</span>
                ) : null}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-xs text-gray-400">
          catalog_scope
          <select
            value={catalogScope}
            onChange={(e) => setCatalogScope(e.target.value as SongCatalogScope)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-emerald-700 focus:outline-none"
          >
            {SONG_CATALOG_SCOPES.map((s) => (
              <option key={s} value={s}>
                {s === 'western' ? 'western（洋楽）' : s === 'domestic' ? 'domestic（邦楽）' : 'unknown'}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="text-xs text-gray-400">
          <legend className="text-xs text-gray-400">ボーカル</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['F', 'M'] as const).map((v) => {
              const checked = v === 'F' ? vocalFlags.f : vocalFlags.m;
              return (
                <label
                  key={v}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-medium ${
                    checked
                      ? 'border-emerald-600 bg-emerald-950/40 text-emerald-100'
                      : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleVocal(v, e.target.checked)}
                    className="accent-emerald-500"
                  />
                  {v}
                </label>
              );
            })}
          </div>
          {vocalLegacy ? (
            <span className="mt-1 block text-[11px] text-amber-300/90">
              既存値「{vocalLegacy}」は F/M に解釈できないため、チェックで上書きしてください。
            </span>
          ) : null}
          {vocalFromArtistHistory && vocal === (formatLibraryVocalDisplay(initialVocal) ?? '') ? (
            <span className="mt-1 block text-[11px] text-gray-500">
              既存曲のボーカル実績から自動入力しました。
            </span>
          ) : null}
          {vocalNoArtistHistory && !vocal.trim() ? (
            <span className="mt-1 block text-[11px] text-gray-500">
              このアーティストの既存曲にボーカル実績がないため未設定です（新規アーティストなど）。
            </span>
          ) : null}
        </fieldset>

        <AdminSongGenreCheckboxField
          selected={genres}
          onChange={setGenres}
          suggested={suggestedGenres}
          allGenres={allGenres}
        />
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

      {workflow ? null : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSave()}
          className="mt-3 rounded bg-emerald-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '保存中…' : '基本情報を保存'}
        </button>
      )}
    </div>
  );
}
