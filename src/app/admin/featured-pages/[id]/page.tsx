'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import {
  FEATURED_PAGE_STYLE_OPTIONS,
  groupFeaturedArtistsByStyle,
  type FeaturedPageStyle,
} from '@/lib/featured-page-styles';
import type { FeaturedPageArtistRow, FeaturedPageWithArtists } from '@/lib/featured-pages';
import { formatFeaturedArtistDisplayLabel } from '@/lib/featured-pages';
import type { AdminLibraryArtistItem } from '@/app/api/admin/library/artists/route';

export default function AdminFeaturedPageEditPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [item, setItem] = useState<FeaturedPageWithArtists | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [published, setPublished] = useState(false);
  const [aiUsageFree, setAiUsageFree] = useState(false);
  const [artists, setArtists] = useState<FeaturedPageArtistRow[]>([]);

  const [libraryArtists, setLibraryArtists] = useState<AdminLibraryArtistItem[]>([]);
  const [artistQuery, setArtistQuery] = useState('');
  const [addStyle, setAddStyle] = useState<FeaturedPageStyle>('Pop');
  const [addLabelNote, setAddLabelNote] = useState('');
  const [busyArtists, setBusyArtists] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/featured-pages/${id}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '読み込みに失敗しました。');
        setItem(null);
        return;
      }
      const next = data.item as FeaturedPageWithArtists;
      setItem(next);
      setTitle(next.title);
      setSlug(next.slug);
      setDescription(next.description ?? '');
      setPublished(next.published);
      setAiUsageFree(next.ai_usage_free);
      setArtists(Array.isArray(next.artists) ? next.artists : []);
    } catch {
      setError('読み込みに失敗しました。');
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/library/artists', { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(data.items)) {
          setLibraryArtists(data.items);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredLibrary = useMemo(() => {
    const q = artistQuery.trim().toLowerCase();
    if (!q) return libraryArtists.slice(0, 40);
    return libraryArtists
      .filter((a) => a.main_artist.toLowerCase().includes(q))
      .slice(0, 40);
  }, [libraryArtists, artistQuery]);

  const grouped = useMemo(() => groupFeaturedArtistsByStyle(artists), [artists]);

  const saveMeta = async () => {
    if (!id) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/featured-pages/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          description: description.trim(),
          published,
          ai_usage_free: aiUsageFree,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '保存に失敗しました。');
        return;
      }
      setMessage('基本情報を保存しました。');
      if (data.item) {
        setItem(data.item);
        setArtists(data.item.artists ?? artists);
      }
    } catch {
      setError('保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const persistArtists = async (next: FeaturedPageArtistRow[]) => {
    if (!id) return;
    setBusyArtists(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/featured-pages/${id}/artists`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artists: next.map((a, i) => ({
            artist_name: a.artist_name,
            style: a.style,
            sort_order: i,
            artist_id: a.artist_id,
            label_note: a.label_note,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'アーティスト保存に失敗しました。');
        return;
      }
      setArtists(Array.isArray(data.artists) ? data.artists : next);
      setMessage('アーティスト一覧を更新しました。');
    } catch {
      setError('アーティスト保存に失敗しました。');
    } finally {
      setBusyArtists(false);
    }
  };

  const addArtist = (name: string) => {
    const artist_name = name.trim();
    if (!artist_name) return;
    if (artists.some((a) => a.artist_name.toLowerCase() === artist_name.toLowerCase())) {
      setMessage(`「${artist_name}」は既に追加済みです。`);
      return;
    }
    const note = addLabelNote.trim() || null;
    const next: FeaturedPageArtistRow[] = [
      ...artists,
      {
        id: `tmp-${Date.now()}`,
        featured_page_id: id,
        artist_name,
        artist_id: null,
        style: addStyle,
        label_note: note,
        sort_order: artists.length,
        created_at: '',
      },
    ];
    setAddLabelNote('');
    void persistArtists(next);
  };

  const removeArtist = (artist_name: string) => {
    void persistArtists(artists.filter((a) => a.artist_name !== artist_name));
  };

  const changeStyle = (artist_name: string, style: FeaturedPageStyle) => {
    void persistArtists(
      artists.map((a) => (a.artist_name === artist_name ? { ...a, style } : a)),
    );
  };

  const changeLabelNote = (artist_name: string, label_note: string) => {
    void persistArtists(
      artists.map((a) =>
        a.artist_name === artist_name
          ? { ...a, label_note: label_note.trim() || null }
          : a,
      ),
    );
  };

  const seedSummerSonic = async () => {
    if (!id) return;
    if (!window.confirm('Summer Sonic 2026 のラインナップで上書きします。よろしいですか？')) return;
    setBusyArtists(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/featured-pages/${id}/artists`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 'summer-sonic-2026' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '投入に失敗しました。');
        return;
      }
      setArtists(Array.isArray(data.artists) ? data.artists : []);
      setMessage('Summer Sonic 2026 ラインナップを投入しました（ライブラリ照合は部屋側で行います）。');
    } catch {
      setError('投入に失敗しました。');
    } finally {
      setBusyArtists(false);
    }
  };

  const deletePage = async () => {
    if (!id || !window.confirm('この特集を削除しますか？')) return;
    const res = await fetch(`/api/admin/featured-pages/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      window.location.href = '/admin/featured-pages';
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(typeof data.error === 'string' ? data.error : '削除に失敗しました。');
  };

  if (!id) {
    return (
      <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
        <p>不正な URL です。</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-5xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">特集を編集</h1>
          <Link href="/admin/featured-pages" className="text-sm text-gray-400 hover:text-gray-200">
            ← 一覧へ
          </Link>
        </div>

        {loading ? <p className="text-gray-400">読み込み中…</p> : null}
        {error ? (
          <p className="mb-3 rounded border border-amber-800 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
            {error}
          </p>
        ) : null}
        {message ? <p className="mb-3 text-sm text-emerald-300">{message}</p> : null}

        {!loading && item ? (
          <>
            <section className="mb-6 space-y-3 rounded border border-gray-700 bg-gray-900/50 p-4">
              <label className="block text-sm">
                <span className="text-gray-400">タイトル</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-400">slug</span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 font-mono text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-400">説明（任意）</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-3 py-2"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                />
                公開する（部屋チャットにボタン表示）
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={aiUsageFree}
                  onChange={(e) => setAiUsageFree(e.target.checked)}
                />
                <span>
                  この特集内のアーティスト選曲時、AI使用量を無料にする
                  <span className="mt-0.5 block text-xs text-gray-500">
                    お試し枠・クレジットを消費しません（API 原価はサイト負担）。特集モーダル経由のみ。
                  </span>
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveMeta()}
                  className="rounded bg-violet-700 px-4 py-2 text-sm hover:bg-violet-600 disabled:opacity-50"
                >
                  {saving ? '保存中…' : '基本情報を保存'}
                </button>
                <button
                  type="button"
                  onClick={() => void deletePage()}
                  className="rounded border border-red-800 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40"
                >
                  削除
                </button>
              </div>
            </section>

            <section className="mb-6 rounded border border-gray-700 bg-gray-900/50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-amber-100">ライブラリからアーティストを追加</h2>
                <button
                  type="button"
                  disabled={busyArtists}
                  onClick={() => void seedSummerSonic()}
                  className="rounded border border-gray-600 px-2 py-1 text-xs hover:bg-gray-800 disabled:opacity-50"
                >
                  Summer Sonic 2026 を投入
                </button>
              </div>
              <div className="mb-2 flex flex-wrap gap-2">
                <select
                  value={addStyle}
                  onChange={(e) => setAddStyle(e.target.value as FeaturedPageStyle)}
                  className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm"
                  aria-label="スタイル"
                >
                  {FEATURED_PAGE_STYLE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  value={addLabelNote}
                  onChange={(e) => setAddLabelNote(e.target.value)}
                  placeholder="自由入力（任意）例: Talking Heads"
                  className="min-w-[12rem] flex-1 rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm"
                  aria-label="自由入力（括弧表示）"
                />
                <input
                  value={artistQuery}
                  onChange={(e) => setArtistQuery(e.target.value)}
                  placeholder="ライブラリ検索 例: David Byrne"
                  className="min-w-[12rem] flex-1 rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm"
                />
              </div>
              <p className="mb-2 text-[11px] text-gray-500">
                自由入力は部屋で「アーティスト名 (自由入力)」と表示されます。例: DAVID BYRNE (Talking Heads)
              </p>
              <ul className="max-h-48 overflow-y-auto rounded border border-gray-800 text-sm">
                {filteredLibrary.map((a) => (
                  <li key={a.main_artist} className="flex items-center justify-between gap-2 border-b border-gray-800 px-2 py-1">
                    <span className="truncate">
                      {a.main_artist}{' '}
                      <span className="text-xs text-gray-500">({a.count})</span>
                    </span>
                    <button
                      type="button"
                      disabled={busyArtists}
                      onClick={() => addArtist(a.main_artist)}
                      className="shrink-0 rounded bg-lime-900/40 px-2 py-0.5 text-xs text-lime-100 hover:bg-lime-900/60 disabled:opacity-50"
                    >
                      追加
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded border border-gray-700 bg-gray-900/50 p-4">
              <h2 className="mb-3 text-sm font-medium text-amber-100">
                登録アーティスト（{artists.length}）
              </h2>
              {grouped.length === 0 ? (
                <p className="text-sm text-gray-500">まだありません。</p>
              ) : (
                <div className="space-y-4">
                  {grouped.map((g) => (
                    <div key={g.style}>
                      <h3 className="mb-1 border-b border-gray-700 pb-1 text-sm font-semibold text-white">
                        {g.style}
                      </h3>
                      <ul className="space-y-1">
                        {g.artists.map((a) => (
                          <li
                            key={a.artist_name}
                            className="flex flex-wrap items-center gap-2 text-sm"
                          >
                            <span className="min-w-[8rem] basis-[30%] truncate font-medium">
                              {formatFeaturedArtistDisplayLabel(a.artist_name, a.label_note)}
                            </span>
                            <input
                              defaultValue={a.label_note ?? ''}
                              key={`${a.artist_name}-${a.label_note ?? ''}`}
                              disabled={busyArtists}
                              placeholder="自由入力"
                              className="min-w-[8rem] flex-1 rounded border border-gray-600 bg-gray-800 px-2 py-0.5 text-xs"
                              onBlur={(e) => {
                                const next = e.target.value.trim();
                                const prev = (a.label_note ?? '').trim();
                                if (next !== prev) changeLabelNote(a.artist_name, next);
                              }}
                              aria-label={`${a.artist_name} の自由入力`}
                            />
                            <select
                              value={a.style}
                              disabled={busyArtists}
                              onChange={(e) =>
                                changeStyle(a.artist_name, e.target.value as FeaturedPageStyle)
                              }
                              className="rounded border border-gray-600 bg-gray-800 px-1 py-0.5 text-xs"
                            >
                              {FEATURED_PAGE_STYLE_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={busyArtists}
                              onClick={() => removeArtist(a.artist_name)}
                              className="text-xs text-red-300 hover:underline disabled:opacity-50"
                            >
                              削除
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
