'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { AdminCatalogGenreCreateModal } from '@/components/admin/AdminCatalogGenreCreateModal';
import {
  groupGenresByInitial,
  catalogGenreKey,
  normalizeCatalogGenreName,
  uniqueNormalizedGenreNames,
  type AdminSuggestedGenre,
} from '@/lib/admin-song-artist-defaults';
import type { CatalogGenreRow } from '@/lib/catalog-genres';

function genreKey(name: string): string {
  return catalogGenreKey(name);
}

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
  suggested: AdminSuggestedGenre[];
  allGenres: string[];
};

export function AdminSongGenreCheckboxField({ selected, onChange, suggested, allGenres }: Props) {
  const titleId = useId();
  const [modalOpen, setModalOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdNames, setCreatedNames] = useState<string[]>([]);
  const selectedKeys = useMemo(() => new Set(selected.map(genreKey)), [selected]);
  const mergedAllGenres = useMemo(
    () => uniqueNormalizedGenreNames([...allGenres, ...createdNames]),
    [allGenres, createdNames],
  );

  const displayByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of mergedAllGenres) {
      const name = normalizeCatalogGenreName(g);
      const k = catalogGenreKey(name);
      if (k && !m.has(k)) m.set(k, name);
    }
    for (const g of suggested) {
      const name = normalizeCatalogGenreName(g.name);
      const k = catalogGenreKey(name);
      if (k && !m.has(k)) m.set(k, name);
    }
    for (const g of selected) {
      const name = normalizeCatalogGenreName(g);
      const k = catalogGenreKey(name);
      if (k && !m.has(k)) m.set(k, name);
    }
    return m;
  }, [mergedAllGenres, suggested, selected]);

  const suggestedUnique = useMemo(() => {
    const map = new Map<string, AdminSuggestedGenre>();
    for (const g of suggested) {
      const name = normalizeCatalogGenreName(g.name);
      const k = catalogGenreKey(name);
      if (!k) continue;
      const cur = map.get(k);
      if (cur) cur.count += g.count;
      else map.set(k, { name, count: g.count });
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'en'));
  }, [suggested]);

  const groupedAll = useMemo(
    () =>
      groupGenresByInitial(
        mergedAllGenres.length > 0 ? mergedAllGenres : suggested.map((g) => g.name),
      ),
    [mergedAllGenres, suggested],
  );
  const initials = useMemo(() => groupedAll.map((g) => g.initial), [groupedAll]);

  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !createOpen) setModalOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [modalOpen, createOpen]);

  function toggleName(name: string) {
    const key = genreKey(name);
    if (!key) return;
    const display = displayByKey.get(key) ?? normalizeCatalogGenreName(name);
    if (selectedKeys.has(key)) {
      onChange(selected.filter((s) => genreKey(s) !== key));
      return;
    }
    onChange([...selected, display]);
  }

  function handleGenreCreated(item: CatalogGenreRow) {
    const name = normalizeCatalogGenreName(item.name);
    if (!name) return;
    setCreatedNames((prev) => uniqueNormalizedGenreNames([...prev, name]));
    if (!selectedKeys.has(genreKey(name))) {
      onChange([...selected, name]);
    }
  }

  function scrollToInitial(initial: string) {
    const el = document.getElementById(`admin-genre-initial-${initial === '#' ? 'other' : initial}`);
    el?.scrollIntoView({ block: 'start' });
  }

  return (
    <div className="sm:col-span-2">
      <p className="text-xs text-gray-400">ジャンル</p>
      {selected.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {selected.map((name) => (
            <button
              key={genreKey(name)}
              type="button"
              onClick={() => toggleName(name)}
              className="rounded-full border border-emerald-800 bg-emerald-950/50 px-2 py-0.5 text-[11px] text-emerald-100 hover:bg-emerald-900/60"
              title="クリックで外す"
            >
              {normalizeCatalogGenreName(name)} ×
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-gray-500">未選択。下の傾向から選ぶか、全ジャンルを開いてください。</p>
      )}

      {suggestedUnique.length > 0 ? (
        <fieldset className="mt-2 rounded border border-gray-800 bg-gray-950/60 p-2">
          <legend className="px-1 text-[11px] text-gray-500">このアーティストで多いジャンル</legend>
          <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
            {suggestedUnique.map((g) => {
              const checked = selectedKeys.has(genreKey(g.name));
              return (
                <label
                  key={genreKey(g.name)}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-gray-200 hover:bg-gray-900"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleName(g.name)}
                    className="accent-emerald-600"
                  />
                  <span className="min-w-0 flex-1 truncate">{normalizeCatalogGenreName(g.name)}</span>
                  <span className="shrink-0 text-[11px] text-gray-500">{g.count}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <p className="mt-2 text-[11px] text-gray-500">このアーティストの既存曲から集計したジャンルはまだありません。</p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded border border-gray-600 bg-gray-900 px-3 py-1.5 text-xs text-gray-100 hover:bg-gray-800"
        >
          すべてのジャンル（{mergedAllGenres.length || suggested.length}）
        </button>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded border border-violet-700/80 bg-violet-950/30 px-3 py-1.5 text-xs font-medium text-violet-100 hover:bg-violet-900/40"
        >
          新規ジャンル登録
        </button>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        マスタに無いジャンルは「新規ジャンル登録」から追加できます。
      </p>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
          role="presentation"
          onClick={() => {
            if (!createOpen) setModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded border border-gray-700 bg-gray-950 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-gray-800 px-4 py-3">
              <h4 id={titleId} className="text-sm font-semibold text-gray-100">
                すべてのジャンル
              </h4>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
              >
                閉じる
              </button>
            </div>
            <div className="flex flex-wrap gap-1 border-b border-gray-800 px-4 py-2">
              {initials.map((initial) => (
                <button
                  key={initial}
                  type="button"
                  onClick={() => scrollToInitial(initial)}
                  className="min-w-[1.5rem] rounded bg-gray-900 px-1.5 py-0.5 text-[11px] font-medium text-sky-300 hover:bg-gray-800"
                >
                  {initial}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {groupedAll.map((group) => (
                <section
                  key={group.initial}
                  id={`admin-genre-initial-${group.initial === '#' ? 'other' : group.initial}`}
                  className="mb-4 scroll-mt-2"
                >
                  <h5 className="mb-2 text-sm font-semibold text-amber-200">{group.initial}</h5>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {group.names.map((name) => {
                      const checked = selectedKeys.has(genreKey(name));
                      return (
                        <label
                          key={genreKey(name)}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-gray-200 hover:bg-gray-900"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleName(name)}
                            className="accent-emerald-600"
                          />
                          <span className="min-w-0 truncate">{name}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-800 px-4 py-3">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="rounded border border-violet-700/80 bg-violet-950/30 px-3 py-1.5 text-xs font-medium text-violet-100 hover:bg-violet-900/40"
              >
                新規ジャンル登録
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AdminCatalogGenreCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleGenreCreated}
      />
    </div>
  );
}
