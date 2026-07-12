/**
 * 部屋ライブラリの洋楽 / 邦楽 / すべて — 端末ローカル preference（アカウント非紐づけ）。
 */

import {
  defaultLibraryCatalogFilter,
  parseLibraryCatalogFilter,
  type LibraryCatalogFilter,
} from '@/lib/song-catalog-scope';

const STORAGE_KEY = 'mc_library_catalog:v1';

export function readLibraryCatalogPreference(): LibraryCatalogFilter | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseLibraryCatalogFilter(raw, defaultLibraryCatalogFilter());
  } catch {
    return null;
  }
}

export function writeLibraryCatalogPreference(value: LibraryCatalogFilter): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore quota / private mode */
  }
}

export function resolveLibraryCatalogPreference(): LibraryCatalogFilter {
  return readLibraryCatalogPreference() ?? defaultLibraryCatalogFilter();
}

export const LIBRARY_CATALOG_FILTER_LABELS: Record<LibraryCatalogFilter, string> = {
  western: '洋楽',
  domestic: '邦楽',
  all: 'すべて',
};

/** UI 表示順（すべてを先頭） */
export const LIBRARY_CATALOG_FILTER_TAB_ORDER: LibraryCatalogFilter[] = ['all', 'western', 'domestic'];
