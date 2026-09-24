'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import {
  AdminCatalogGenreForm,
  EMPTY_CATALOG_GENRE_FORM,
  type AdminCatalogGenreFormValues,
} from '@/components/admin/AdminCatalogGenreForm';

export default function AdminCatalogGenreNewPage() {
  const router = useRouter();
  const [values, setValues] = useState<AdminCatalogGenreFormValues>(EMPTY_CATALOG_GENRE_FORM);
  const [autoSlug, setAutoSlug] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/catalog-genres', {
        method: 'POST',
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
      const data = (await res.json().catch(() => ({}))) as { error?: string; item?: { id?: string } };
      if (!res.ok) {
        setError(data.error ?? '登録に失敗しました。');
        return;
      }
      const id = data.item?.id;
      if (typeof id === 'string') {
        router.push(`/admin/genres/${id}`);
        return;
      }
      router.push('/admin/genres');
    } catch {
      setError('登録に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-2xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">ジャンルを新規登録</h1>
          <Link href="/admin/genres" className="text-sm text-gray-400 hover:text-gray-200">
            ← 一覧へ
          </Link>
        </div>
        <p className="mb-4 text-sm text-gray-400">
          作成したジャンルは曲詳細のジャンル選択に出ます。公開索引に載るのは、曲が紐づいたあとです。
        </p>
        {error ? (
          <p className="mb-4 rounded border border-amber-800 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
            {error}
          </p>
        ) : null}
        <AdminCatalogGenreForm
          values={values}
          onChange={setValues}
          onSubmit={() => void submit()}
          submitting={submitting}
          submitLabel="登録する"
          autoSlugFromName={autoSlug}
          onAutoSlugChange={setAutoSlug}
        />
      </div>
    </main>
  );
}
