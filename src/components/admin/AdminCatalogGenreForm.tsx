'use client';

import type { FormEvent } from 'react';
import { normalizeCatalogGenreSlug } from '@/lib/catalog-genres';

export type AdminCatalogGenreFormValues = {
  name: string;
  slug: string;
  name_ja: string;
  description_ja: string;
  parent_genre: string;
  wp_term_id: string;
};

type Props = {
  values: AdminCatalogGenreFormValues;
  onChange: (next: AdminCatalogGenreFormValues) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
  autoSlugFromName?: boolean;
  onAutoSlugChange?: (enabled: boolean) => void;
};

const inputClass =
  'rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500';

export function AdminCatalogGenreForm({
  values,
  onChange,
  onSubmit,
  submitting,
  submitLabel,
  autoSlugFromName = false,
  onAutoSlugChange,
}: Props) {
  function patch(partial: Partial<AdminCatalogGenreFormValues>) {
    onChange({ ...values, ...partial });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-1 text-xs text-gray-400">
        英語名 <span className="text-amber-300/90">必須</span>
        <input
          type="text"
          value={values.name}
          maxLength={120}
          required
          placeholder="例: Art pop"
          className={inputClass}
          onChange={(e) => {
            const name = e.target.value;
            if (autoSlugFromName) {
              patch({ name, slug: normalizeCatalogGenreSlug(name) });
              return;
            }
            patch({ name });
          }}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-gray-400">
        slug <span className="text-amber-300/90">必須</span>
        <input
          type="text"
          value={values.slug}
          maxLength={80}
          placeholder="例: art-pop（空なら英語名から自動）"
          className={`${inputClass} font-mono`}
          onChange={(e) => {
            onAutoSlugChange?.(false);
            patch({ slug: e.target.value });
          }}
        />
        <span className="text-[11px] text-gray-500">
          公開 URL は /music/genres/（slug）/1 。英数字とハイフン。空欄なら英語名から自動生成します。
        </span>
      </label>

      <label className="flex flex-col gap-1 text-xs text-gray-400">
        日本語名
        <input
          type="text"
          value={values.name_ja}
          maxLength={120}
          placeholder="例: アートポップ"
          className={inputClass}
          onChange={(e) => patch({ name_ja: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-gray-400">
        日本語説明
        <textarea
          value={values.description_ja}
          maxLength={4000}
          rows={4}
          placeholder="任意。公開ページではまだ未使用です。"
          className={inputClass}
          onChange={(e) => patch({ description_ja: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-gray-400">
        親ジャンル（WP parent_genre）
        <input
          type="text"
          value={values.parent_genre}
          maxLength={120}
          placeholder="例: jazz / reggae（ナビの style と一致しない値もそのまま保持）"
          className={inputClass}
          onChange={(e) => patch({ parent_genre: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-gray-400">
        WP term ID
        <input
          type="text"
          inputMode="numeric"
          value={values.wp_term_id}
          placeholder="任意。Music8 WP の term ID"
          className={`${inputClass} max-w-xs font-mono`}
          onChange={(e) => patch({ wp_term_id: e.target.value })}
        />
      </label>

      <div>
        <button
          type="submit"
          disabled={submitting || !values.name.trim()}
          className="rounded bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
        >
          {submitting ? '保存中…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

export const EMPTY_CATALOG_GENRE_FORM: AdminCatalogGenreFormValues = {
  name: '',
  slug: '',
  name_ja: '',
  description_ja: '',
  parent_genre: '',
  wp_term_id: '',
};
