'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpenIcon } from '@heroicons/react/24/outline';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { AdminYoutubePlayerWithVolume } from '@/components/admin/AdminYoutubePlayerWithVolume';
import type { AdminLibraryArtistItem } from '@/app/api/admin/library/artists/route';
import type { AdminLibrarySongItem } from '@/app/api/admin/library/songs/route';
import { libraryEffectiveReleaseDateForSort } from '@/lib/library-release-sort-date';
import { shouldShowArtistMembersLine } from '@/lib/artist-members';

type SortMode = 'release_new' | 'release_old' | 'spotify_popularity';
type AdminLibraryArtistInfo = {
  id: string;
  name: string;
  name_ja: string | null;
  music8_artist_slug: string | null;
  kind: string | null;
  origin_country: string | null;
  active_period: string | null;
  members: string | null;
  youtube_channel_title: string | null;
  youtube_channel_url: string | null;
  image_url: string | null;
  image_credit: string | null;
  profile_text: string | null;
  memberArtists?: { name: string; music8_artist_slug?: string | null }[];
  bandArtists?: { name: string; music8_artist_slug?: string | null }[];
};

function adminArtistHref(link: { name: string; music8_artist_slug?: string | null }): string {
  const slug = (link.music8_artist_slug ?? '').trim();
  if (slug) return `/admin/library/artist?slug=${encodeURIComponent(slug)}`;
  return `/admin/library/artist?name=${encodeURIComponent(link.name)}`;
}

function AdminArtistRelationLine({
  label,
  links,
  fallback,
}: {
  label: string;
  links?: { name: string; music8_artist_slug?: string | null }[];
  fallback?: string | null;
}) {
  const items = (links ?? []).filter((l) => (l.name ?? '').trim());
  if (items.length > 0) {
    return (
      <p>
        {label}：
        {items.map((link, i) => (
          <span key={`${link.name}-${i}`}>
            {i > 0 ? '、' : null}
            <Link href={adminArtistHref(link)} className="text-sky-400 hover:underline">
              {link.name}
            </Link>
          </span>
        ))}
      </p>
    );
  }
  if ((fallback ?? '').trim()) {
    return (
      <p>
        {label}：{fallback}
      </p>
    );
  }
  return null;
}

export default function AdminLibraryPage() {
  const [artists, setArtists] = useState<AdminLibraryArtistItem[]>([]);
  const [letters, setLetters] = useState<string[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(true);
  const [artistsError, setArtistsError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [letterFilter, setLetterFilter] = useState<string | null>(null);

  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [songs, setSongs] = useState<AdminLibrarySongItem[]>([]);
  const [artistInfo, setArtistInfo] = useState<AdminLibraryArtistInfo | null>(null);
  const [sort, setSort] = useState<SortMode>('release_new');
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [songsError, setSongsError] = useState<string | null>(null);
  const [loadingArtistInfo, setLoadingArtistInfo] = useState(false);
  const [artistInfoError, setArtistInfoError] = useState<string | null>(null);
  const [dbDetailModalSong, setDbDetailModalSong] = useState<{
    id: string;
    title: string;
    videoId: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingArtists(true);
      setArtistsError(null);
      try {
        const res = await fetch('/api/admin/library/artists');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setArtistsError(data?.error || 'アーティスト一覧の取得に失敗しました。');
          return;
        }
        if (!cancelled) {
          setArtists(Array.isArray(data.items) ? data.items : []);
          setLetters(Array.isArray(data.letters) ? data.letters : []);
        }
      } catch {
        if (!cancelled) setArtistsError('アーティスト一覧の取得に失敗しました。');
      } finally {
        if (!cancelled) setLoadingArtists(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSongs = useCallback(async (artist: string, sortMode: SortMode) => {
    setLoadingSongs(true);
    setSongsError(null);
    try {
      const q = new URLSearchParams({ artist, sort: sortMode });
      const res = await fetch(`/api/admin/library/songs?${q.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSongsError(data?.error || '曲一覧の取得に失敗しました。');
        setSongs([]);
        return;
      }
      setSongs(Array.isArray(data.items) ? data.items : []);
    } catch {
      setSongsError('曲一覧の取得に失敗しました。');
      setSongs([]);
    } finally {
      setLoadingSongs(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedArtist) {
      setSongs([]);
      setArtistInfo(null);
      return;
    }
    void loadSongs(selectedArtist, sort);
  }, [selectedArtist, sort, loadSongs]);

  const loadArtistInfo = useCallback(async (artist: string) => {
    setLoadingArtistInfo(true);
    setArtistInfoError(null);
    try {
      const q = new URLSearchParams({ artist });
      const res = await fetch(`/api/admin/library/artist-info?${q.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setArtistInfoError(data?.error || 'アーティスト情報の取得に失敗しました。');
        setArtistInfo(null);
        return;
      }
      setArtistInfo((data?.artist as AdminLibraryArtistInfo | null) ?? null);
    } catch {
      setArtistInfoError('アーティスト情報の取得に失敗しました。');
      setArtistInfo(null);
    } finally {
      setLoadingArtistInfo(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedArtist) return;
    void loadArtistInfo(selectedArtist);
  }, [selectedArtist, loadArtistInfo]);

  const filteredArtists = useMemo(() => {
    const q = query.trim().toLowerCase();
    return artists.filter((a) => {
      if (letterFilter && a.indexLetter !== letterFilter) return false;
      if (!q) return true;
      return a.main_artist.toLowerCase().includes(q);
    });
  }, [artists, query, letterFilter]);

  const totalSongCount = useMemo(() => artists.reduce((sum, a) => sum + a.count, 0), [artists]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-gray-950 p-4 text-gray-100 sm:p-6">
      <AdminMenuBar />
      <h1 className="text-xl font-semibold text-white sm:text-2xl">ライブラリ（曲マスタ）</h1>
      <p className="mt-2 text-sm text-gray-400">
        DB の <code className="rounded bg-gray-800 px-1">songs</code> をアーティスト別に参照します。主要メタに日本語等がある邦楽寄り行は一覧に出しません（英字主体の洋楽例外は維持）。公開年・再生数は列がある環境でのみ表示されます。
      </p>
      {!loadingArtists && !artistsError && (
        <p className="mt-2 text-sm text-gray-400">
          登録曲数：<span className="font-semibold text-amber-200">{totalSongCount.toLocaleString()}</span> 曲
          <span className="ml-2 text-xs text-gray-600">（{artists.length} アーティスト）</span>
        </p>
      )}

      <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
        <h2 className="text-sm font-semibold text-amber-200">検索・索引</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-xs text-gray-500">
            アーティスト名（部分一致）
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="例: Police, Beatles"
              className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-600 focus:outline-none"
            />
          </label>
          <button
            type="button"
            className="rounded border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
            onClick={() => {
              setLetterFilter(null);
              setQuery('');
            }}
          >
            フィルタ解除
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setLetterFilter(null)}
            className={`rounded px-2 py-1 text-xs font-medium ${
              letterFilter === null ? 'bg-amber-700 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            全字母
          </button>
          {letters.map((L) => (
            <button
              key={L}
              type="button"
              onClick={() => setLetterFilter(L)}
              className={`rounded px-2 py-1 text-xs font-medium ${
                letterFilter === L ? 'bg-amber-700 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {L}
            </button>
          ))}
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
          <h2 className="text-sm font-semibold text-amber-200">アーティスト一覧</h2>
          {loadingArtists && <p className="mt-3 text-sm text-gray-500">読み込み中…</p>}
          {artistsError && (
            <p className="mt-3 text-sm text-red-400" role="alert">
              {artistsError}
            </p>
          )}
          {!loadingArtists && !artistsError && (
            <p className="mt-1 text-xs text-gray-500">
              {filteredArtists.length} 件表示 / 全 {artists.length} グループ
            </p>
          )}
          <ul className="mt-3 max-h-[min(70vh,520px)] space-y-1 overflow-y-auto pr-1 text-sm">
            {filteredArtists.map((a) => {
              const active = selectedArtist === a.main_artist;
              return (
                <li key={a.main_artist}>
                  <button
                    type="button"
                    onClick={() => setSelectedArtist(a.main_artist)}
                    className={`w-full rounded px-2 py-1.5 text-left font-mono text-xs sm:text-sm ${
                      active ? 'bg-gray-800 text-amber-100 ring-1 ring-amber-700' : 'text-gray-300 hover:bg-gray-800/80'
                    }`}
                  >
                    <span className="text-gray-500">({a.indexLetter})</span> {a.main_artist}{' '}
                    <span className="text-amber-200/90">({a.count})</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-amber-200">曲一覧</h2>
            {selectedArtist && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">並び:</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortMode)}
                  className="rounded border border-gray-700 bg-gray-950 px-2 py-1 text-gray-200"
                >
                  <option value="release_new">公開日 NEW</option>
                  <option value="release_old">公開日 OLD</option>
                  <option value="spotify_popularity">Spotify人気順</option>
                </select>
              </div>
            )}
          </div>
          {!selectedArtist && (
            <p className="mt-4 text-sm text-gray-500">左でアーティストを選ぶと、ここに曲が表示されます。</p>
          )}
          {selectedArtist && (
            <div className="mt-1 flex items-center gap-3 text-xs">
              <p className="text-gray-500">
                選択: <span className="text-gray-300">{selectedArtist}</span>
              </p>
              <Link
                href={`/admin/library/artist?name=${encodeURIComponent(selectedArtist)}`}
                className="text-amber-200/90 hover:underline"
              >
                アーティスト情報
              </Link>
            </div>
          )}
          {loadingSongs && <p className="mt-3 text-sm text-gray-500">曲を読み込み中…</p>}
          {songsError && (
            <p className="mt-3 text-sm text-red-400" role="alert">
              {songsError}
            </p>
          )}
          {selectedArtist && !loadingSongs && !songsError && songs.length === 0 && (
            <p className="mt-3 text-sm text-gray-500">曲がありません。</p>
          )}
          {selectedArtist && !loadingSongs && !songsError && songs.length > 0 && (
            <>
              <section className="mt-3 rounded border border-gray-800 bg-gray-950/50 p-3 text-xs text-gray-300">
                {loadingArtistInfo ? (
                  <p className="py-2 text-gray-500">読み込み中…</p>
                ) : artistInfoError ? (
                  <p className="py-2 text-red-400">{artistInfoError}</p>
                ) : !artistInfo ? (
                  <p className="py-2 text-gray-500">artists に情報がありません。</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-4">
                      {(artistInfo.image_url ?? '').trim() ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={artistInfo.image_url as string}
                          alt={artistInfo.name}
                          className="h-28 w-28 flex-shrink-0 rounded object-cover"
                          loading="lazy"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1 space-y-1.5 text-gray-300">
                        <p className="text-sm font-medium text-gray-100">
                          {artistInfo.name_ja?.trim() || artistInfo.name}
                          {(artistInfo.origin_country ?? '').trim()
                            ? ` (${artistInfo.origin_country})`
                            : ''}
                        </p>
                        {(artistInfo.kind ?? '').trim() ? (
                          <p className="lowercase text-gray-300">{artistInfo.kind}</p>
                        ) : null}
                        {(artistInfo.active_period ?? '').trim() ? (
                          <p>
                            活動期間：
                            {(() => {
                              const ap = (artistInfo.active_period ?? '').trim();
                              return ap.match(/ -$/) ? `${ap} /` : ap;
                            })()}
                          </p>
                        ) : null}
                        {(artistInfo.bandArtists ?? []).length > 0 ? (
                          <AdminArtistRelationLine label="所属バンド" links={artistInfo.bandArtists} />
                        ) : null}
                        {shouldShowArtistMembersLine({
                          kind: artistInfo.kind,
                          memberLinkCount: (artistInfo.memberArtists ?? []).filter((l) =>
                            (l.name ?? '').trim(),
                          ).length,
                          bandLinkCount: (artistInfo.bandArtists ?? []).filter((l) =>
                            (l.name ?? '').trim(),
                          ).length,
                          hasMembersFallback: Boolean((artistInfo.members ?? '').trim()),
                        }) ? (
                          <AdminArtistRelationLine
                            label="メンバー"
                            links={artistInfo.memberArtists}
                            fallback={artistInfo.members}
                          />
                        ) : null}
                        {(artistInfo.youtube_channel_url ?? '').trim() ? (
                          <p className="pt-1">
                            <a
                              href={artistInfo.youtube_channel_url as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sky-400 hover:underline"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/svg/youtube.svg" alt="" width={18} height={18} className="h-4 w-4 shrink-0" />
                              <span>{artistInfo.youtube_channel_title?.trim() || 'YouTube Channel'}</span>
                            </a>
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {(artistInfo.profile_text ?? '').trim() ? (
                      <p className="border-t border-gray-700/80 pt-3 whitespace-pre-wrap leading-relaxed text-gray-300" style={{ lineHeight: 1.7 }}>
                        {artistInfo.profile_text}
                      </p>
                    ) : null}
                  </div>
                )}
              </section>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-xs text-gray-200">
                  <thead className="border-b border-gray-700 text-gray-500">
                    <tr>
                      <th className="py-2 pr-3 font-medium">公開日</th>
                      <th className="py-2 pr-3 font-medium">アーティスト</th>
                      <th className="py-2 pr-3 font-medium">タイトル</th>
                      <th className="py-2 pr-3 font-medium">スタイル</th>
                      <th className="py-2 pr-3 font-medium text-right">再生</th>
                      <th className="py-2 pr-3 font-medium text-center">解説</th>
                      <th className="py-2 font-medium">YouTube</th>
                      <th className="py-2 pl-2 font-medium">詳細</th>
                    </tr>
                  </thead>
                  <tbody>
                    {songs.map((s) => {
                      const effective = libraryEffectiveReleaseDateForSort({
                        originalReleaseDate: s.original_release_date,
                        youtubePublishedAt: s.youtube_published_at,
                      });
                      const releaseLabel = effective
                        ? effective.length >= 10
                          ? `${effective.slice(0, 4)}.${effective.slice(5, 7)}.${effective.slice(8, 10)}`
                          : effective.slice(0, 4)
                        : '—';
                      const title = (s.song_title ?? s.display_title ?? '—').trim();
                      const yt = s.video_id
                        ? `https://www.youtube.com/watch?v=${encodeURIComponent(s.video_id)}`
                        : null;
                      return (
                        <tr key={s.id} className="border-t border-gray-800/90">
                          <td
                            className="py-2 pr-3 align-top tabular-nums text-gray-400"
                            title={
                              s.original_release_date?.trim()
                                ? `表示日: ${s.original_release_date}`
                                : s.youtube_published_at?.trim()
                                  ? `YouTube公開日（原盤日なし）: ${s.youtube_published_at}`
                                  : undefined
                            }
                          >
                            {releaseLabel}
                            {!s.original_release_date?.trim() &&
                            s.youtube_published_at?.trim() &&
                            releaseLabel !== '—' ? (
                              <span className="ml-0.5 text-[10px] text-gray-600">YT</span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 align-top">{s.main_artist ?? '—'}</td>
                          <td className="py-2 pr-3 align-top">{title}</td>
                          <td className="py-2 pr-3 align-top text-gray-400">{s.style ?? '—'}</td>
                          <td className="py-2 pr-3 align-top text-right tabular-nums text-gray-400">
                            {s.play_count ?? 0}
                          </td>
                          <td className="py-2 pr-3 align-top text-center">
                            {s.has_ai_commentary ? (
                              <span
                                className="inline-flex justify-center text-sky-400"
                                title="この曲に AI曲解説（ai_commentary）が保存済み"
                                aria-label="AI曲解説あり"
                              >
                                <BookOpenIcon className="h-4 w-4" aria-hidden />
                              </span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="py-2 align-top">
                            {yt ? (
                              <a
                                href={yt}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sky-400 hover:underline"
                              >
                                開く
                              </a>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="py-2 pl-2 align-top">
                            <button
                              type="button"
                              onClick={() =>
                                setDbDetailModalSong({
                                  id: s.id,
                                  title:
                                    (s.song_title ?? s.display_title ?? '（タイトル不明）').trim() ||
                                    '（タイトル不明）',
                                  videoId: s.video_id?.trim() || null,
                                })
                              }
                              className="text-amber-200/90 hover:underline"
                            >
                              DB
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {dbDetailModalSong && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3"
          role="dialog"
          aria-modal="true"
          aria-label="曲詳細（DB）"
        >
          <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-950 shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-2">
              <p className="min-w-0 truncate text-sm text-gray-200">
                曲詳細（DB）: {dbDetailModalSong.title}
              </p>
              <div className="flex items-center gap-3">
                <a
                  href={`/admin/songs/${dbDetailModalSong.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-sky-400 hover:underline"
                >
                  新しいタブで開く
                </a>
                <button
                  type="button"
                  onClick={() => setDbDetailModalSong(null)}
                  className="rounded border border-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-800"
                >
                  閉じる
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <iframe
                title={`song-detail-${dbDetailModalSong.id}`}
                src={`/admin/songs/${dbDetailModalSong.id}?modal=1`}
                className="min-h-0 w-full flex-1 border-0 bg-gray-950"
              />
              {/* 右側プレイヤー＋外側音量（入れ子 iframe 内の YT 音量は掴みにくい） */}
              {dbDetailModalSong.videoId ? (
                <div className="shrink-0 border-t border-gray-800 p-3 lg:w-[min(42%,26rem)] lg:border-l lg:border-t-0 lg:border-gray-800">
                  <AdminYoutubePlayerWithVolume videoId={dbDetailModalSong.videoId} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <section className="mt-8 rounded-lg border border-dashed border-gray-700 p-4 text-sm text-gray-500">
        <p>
          URL からの直接追加・AI 解説モーダルは今後の拡張です。既存の{' '}
          <Link href="/admin/songs" className="text-amber-200/90 hover:underline">
            曲ダッシュボード（検索）
          </Link>
          ・
          <Link href="/admin/song-lookup" className="text-amber-200/90 hover:underline">
            曲引き
          </Link>
          からも参照できます。
        </p>
      </section>
    </main>
  );
}
