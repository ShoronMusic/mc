'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AdminCatalogGenreForm,
  EMPTY_CATALOG_GENRE_FORM,
  type AdminCatalogGenreFormValues,
} from '@/components/admin/AdminCatalogGenreForm';
import type { CatalogGenreRow } from '@/lib/catalog-genres';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (item: CatalogGenreRow) => void;
};

export function AdminCatalogGenreCreateModal({ open, onClose, onCreated }: Props) {
  const titleId = useId();
  const [values, setValues] = useState<AdminCatalogGenreFormValues>(EMPTY_CATALOG_GENRE_FORM);
  const [autoSlug, setAutoSlug] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setValues(EMPTY_CATALOG_GENRE_FORM);
    setAutoSlug(true);
    setError(null);
    setSubmitting(false);
    submittingRef.current = false;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (submittingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  async function submit() {
    setSubmitting(true);
    submittingRef.current = true;
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
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        item?: CatalogGenreRow;
      };
      if (!res.ok || !data.item) {
        setError(data.error ?? '登録に失敗しました。');
        return;
      }
      onCreated(data.item);
      onClose();
    } catch {
      setError('登録に失敗しました。');
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-3"
      role="presentation"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[88vh] w-full max-w-lg flex-col rounded border border-gray-700 bg-gray-950 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-gray-800 px-4 py-3">
          <h4 id={titleId} className="text-sm font-semibold text-gray-100">
            ジャンルを新規登録
          </h4>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-40"
          >
            閉じる
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="mb-3 text-[11px] text-gray-500">
            作成したジャンルはすぐ選択できます。公開索引に載るのは、曲が紐づいたあとです。
          </p>
          {error ? (
            <p className="mb-3 rounded border border-amber-800 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
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
      </div>
    </div>,
    document.body,
  );
}
