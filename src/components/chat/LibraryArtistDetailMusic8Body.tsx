'use client';

import {
  formatMusic8ArtistDisplayLines,
  type Music8ArtistJson,
} from '@/lib/music8-artist-display';

/** ライブラリ「アーティスト詳細」列用（DB 未整備時は Music8 GCS JSON を表示） */
export function LibraryArtistDetailMusic8Body({
  artist,
  dbRegistered = false,
}: {
  artist: Music8ArtistJson;
  /** DB `artists` に行はあるがプロフィール未整備のとき true */
  dbRegistered?: boolean;
}) {
  const lines = formatMusic8ArtistDisplayLines(artist);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        {lines.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Music8 外部 URL
          <img
            src={lines.imageUrl}
            alt=""
            className="h-16 w-16 flex-shrink-0 rounded object-cover"
            loading="lazy"
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1 text-gray-300">
          <p className="font-medium text-gray-100">
            {lines.nameDisplay}
            {lines.origin ? ` (${lines.origin})` : ''}
          </p>
          {lines.occupationDisplay ? (
            <p className="lowercase text-gray-400">{lines.occupationDisplay}</p>
          ) : null}
          {lines.activeYears ? (
            <p className="text-gray-400">活動期間：{lines.activeYears}</p>
          ) : null}
          {lines.memberDisplay ? <p className="text-gray-400">メンバー：{lines.memberDisplay}</p> : null}
          {lines.bornFormatted ? <p className="text-gray-400">生年月日：{lines.bornFormatted}</p> : null}
        </div>
      </div>
      {lines.descriptionJa ? (
        <p className="border-t border-gray-700/60 pt-2 leading-relaxed text-gray-400">
          {lines.descriptionJa}
        </p>
      ) : null}
      <p className="text-[10px] text-gray-500">
        {dbRegistered ? '参照: Music8（DB プロフィール未整備）' : '参照: Music8（曲マスタ未登録のため）'}
      </p>
    </div>
  );
}
