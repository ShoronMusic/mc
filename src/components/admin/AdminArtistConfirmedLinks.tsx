'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AdminArtistProfileModal } from '@/components/admin/AdminArtistProfileModal';
import { AdminNewArtistBadge } from '@/components/admin/AdminNewArtistBadge';

export type AdminArtistConfirmedLinkItem = {
  id: string;
  name: string;
  /** 選曲／曲登録由来で未整備 */
  isNewArtist?: boolean;
};

type Props = {
  /** 共演含むアーティスト一覧（display_order 順）。空なら何も出さない */
  artists: AdminArtistConfirmedLinkItem[];
  currentSongId: string;
  modalEmbed?: boolean;
};

export function AdminArtistConfirmedLinks({
  artists,
  currentSongId,
  modalEmbed = false,
}: Props) {
  const [openName, setOpenName] = useState<string | null>(null);
  const list = artists
    .map((a) => ({
      id: a.id.trim(),
      name: a.name.trim(),
      isNewArtist: Boolean(a.isNewArtist),
    }))
    .filter((a) => a.id && a.name);

  if (list.length === 0) return null;

  return (
    <>
      <div className="space-y-1.5">
        <p className="text-[11px] text-gray-500">
          アーティスト詳細・編集（{list.length} 名）
        </p>
        <ul className="space-y-1.5">
          {list.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
            >
              <span className="min-w-0 font-medium text-gray-200">{a.name}</span>
              {a.isNewArtist ? <AdminNewArtistBadge /> : null}
              <button
                type="button"
                onClick={() => setOpenName(a.name)}
                className="text-sky-400 hover:underline"
              >
                アーティスト詳細
              </button>
              <Link
                href={`/admin/domestic-artist-register/${a.id}`}
                className="text-emerald-400 hover:underline"
              >
                アーティストを編集
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {openName ? (
        <AdminArtistProfileModal
          artistName={openName}
          currentSongId={currentSongId}
          modalEmbed={modalEmbed}
          onClose={() => setOpenName(null)}
        />
      ) : null}
    </>
  );
}
