'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import {
  RegistrationStatusIcons,
  type RegisteredArtistRow,
} from '@/components/admin/DomesticArtistRegisterParts';

export function DomesticArtistListPanel() {
  const [registeredArtists, setRegisteredArtists] = useState<RegisteredArtistRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const loadRegisteredArtists = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch('/api/admin/domestic-artist-profile/list', { credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        rows?: RegisteredArtistRow[];
      };
      if (!res.ok) {
        setRegisteredArtists([]);
        setListError(data.error ?? '登録済み一覧の読み込みに失敗しました。');
        return;
      }
      setRegisteredArtists(Array.isArray(data.rows) ? data.rows : []);
    } catch {
      setRegisteredArtists([]);
      setListError('登録済み一覧の読み込みに失敗しました。');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRegisteredArtists();
  }, [loadRegisteredArtists]);

  return (
    <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-200">登録済みアーティスト（アルファベット順）</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/domestic-artist-register/new"
            className="rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500"
          >
            ＋ 新規登録
          </Link>
          <button
            type="button"
            onClick={() => void loadRegisteredArtists()}
            disabled={listLoading}
            className="rounded border border-gray-600 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
          >
            {listLoading ? '読込中…' : '再読込'}
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        <code className="rounded bg-gray-800 px-1">catalog_scope = domestic</code> の artists 行です。行をクリックすると編集画面へ移動します。
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
        <span className="text-gray-400">登録ステータス:</span>
        <span>①名前のみ</span>
        <RegistrationStatusIcons
          status={{
            stage: 5,
            hasBasicInfo: true,
            hasSpotify: true,
            hasYoutube: true,
            hasWikipedia: true,
          }}
        />
        <span className="text-gray-600">＝ 全項目済の例（未登録はグレー）</span>
      </div>
      {listError ? <p className="mt-3 text-sm text-red-300">{listError}</p> : null}
      {!listLoading && !listError && registeredArtists.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">登録済みのアーティストはまだありません。</p>
      ) : null}
      {registeredArtists.length > 0 ? (
        <ul className="mt-3 max-h-[32rem] divide-y divide-gray-800 overflow-y-auto rounded border border-gray-800">
          {registeredArtists.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/domestic-artist-register/${row.id}`}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-800/70"
              >
                {row.imageUrl ? (
                  <span className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={row.imageUrl}
                      alt=""
                      className="h-10 w-10 rounded border border-gray-700 object-cover"
                    />
                  </span>
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-gray-700 bg-gray-950 text-[10px] text-gray-600">
                    —
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-gray-100">{row.name}</span>
                  {row.nameJa ? (
                    <span className="block truncate text-xs text-gray-500">{row.nameJa}</span>
                  ) : null}
                  <span className="mt-0.5 block text-xs tabular-nums text-emerald-200/90">
                    登録曲 {typeof row.songCount === 'number' ? row.songCount : '—'} 件
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <RegistrationStatusIcons status={row.status} />
                  <span className="text-[10px] text-gray-500">段階 {row.status.stage}/5</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {!listLoading && registeredArtists.length > 0 ? (
        <p className="mt-2 text-xs text-gray-500">{registeredArtists.length} 件</p>
      ) : null}
    </section>
  );
}
