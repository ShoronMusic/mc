'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import {
  AdminCatalogGenreForm,
  EMPTY_CATALOG_GENRE_FORM,
  type AdminCatalogGenreFormValues,
} from '@/components/admin/AdminCatalogGenreForm';
import type { CatalogGenreRow } from '@/lib/catalog-genres';
import { musicLibraryGenreHref } from '@/lib/music-library-urls';

function valuesFromItem(item: CatalogGenreRow): AdminCatalogGenreFormValues {
  return {
    name: item.name,
    slug: item.slug,
    name_ja: item.name_ja ?? '',
    description_ja: item.description_ja ?? '',
    parent_genre: item.parent_genre ?? '',
    wp_term_id: item.wp_term_id != null ? String(item.wp_term_id) : '',
  };
}

export default function AdminCatalogGenreEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [item, setItem] = useState<CatalogGenreRow | null>(null);
  const [values, setValues] = useState<AdminCatalogGenreFormValues>(EMPTY_CATALOG_GENRE_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/catalog-genres/${encodeURIComponent(id)}`, {
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        item?: CatalogGenreRow;
      };
      if (!res.ok) {
        setItem(null);
        setError(data.error ?? '読み込みに失敗しました。');
        return;
      }
      if (!data.item) {
        setItem(null);
        setError('ジャンルが見つかりません。');
        return;
      }
      setItem(data.item);
      setValues(valuesFromItem(data.item));
    } catch {
      setItem(null);
      setError('読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/catalog-genres/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          slug: values.slug,
          name_ja: values.name_ja,
          description_ja: values.description_ja,
          parent_genre: values.parent_genre,
          wp_term_id: values.wp_term_id.trim() ? values.wp_term_id.trim() : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        item?: CatalogGenreRow;
      };
      if (!res.ok) {
        setError(data.error ?? '保存に失敗しました。');
        return;
      }
      if (data.item) {
        setItem(data.item);
        setValues(valuesFromItem(data.item));
      }
      setMessage('保存しました。');
    } catch {
      setError('保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id || !item) return;
    const countLabel =
      typeof item.song_count === 'number' && item.song_count > 0
        ? `紐づく曲 ${item.song_count} 件のジャンルリンクも外れます。`
        : '紐づく曲はありません。';
    if (!window.confirm(`「${item.name}」を削除しますか？\n${countLabel}`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/catalog-genres/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? '削除に失敗しました。');
        return;
      }
      router.push('/admin/genres');
    } catch {
      setError('削除に失敗しました。');
    } finally {
      setDeleting(false);
    }
  };

  if (!id) {
    return (
      <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
        <p>不正な URL です。</p>
      </main>
    );
  }

  const publicHref = item ? musicLibraryGenreHref(item.slug, 1) : null;

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-2xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">ジャンルを編集</h1>
          <Link href="/admin/genres" className="text-sm text-gray-400 hover:text-gray-200">
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
            <p className="mb-4 text-sm text-gray-400">
              {typeof item.song_count === 'number' ? `${item.song_count} 曲が紐づいています。` : null}
              {publicHref ? (
                <>
                  {' '}
                  公開:{' '}
                  <Link href={publicHref} className="text-sky-300 hover:underline" target="_blank">
                    {publicHref}
                  </Link>
                </>
              ) : null}
            </p>
            <AdminCatalogGenreForm
              values={values}
              onChange={setValues}
              onSubmit={() => void save()}
              submitting={saving}
              submitLabel="保存する"
            />
            <div className="mt-8 border-t border-gray-800 pt-4">
              <button
                type="button"
                disabled={deleting}
                onClick={() => void remove()}
                className="rounded border border-red-800 bg-red-950/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-950/70 disabled:opacity-50"
              >
                {deleting ? '削除中…' : 'このジャンルを削除'}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
