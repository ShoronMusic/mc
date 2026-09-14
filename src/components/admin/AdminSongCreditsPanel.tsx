'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminArtistPhoto } from '@/components/admin/AdminArtistPhoto';
import { AdminArtistProfileModal } from '@/components/admin/AdminArtistProfileModal';
import { AdminNewArtistBadge } from '@/components/admin/AdminNewArtistBadge';

export type AdminSongCreditRow = {
  artistId: string;
  artistName: string;
  role: string;
  displayOrder: number;
  /** 選曲／曲登録由来で未整備 */
  isNewArtist?: boolean;
  spotifyArtistId?: string | null;
};

type Props = {
  songId: string;
  mainArtist: string | null;
  artistImageUrl?: string | null;
  initialCredits: AdminSongCreditRow[];
  modalEmbed?: boolean;
};

export function AdminSongCreditsPanel({
  songId,
  mainArtist,
  artistImageUrl = null,
  initialCredits,
  modalEmbed = false,
}: Props) {
  const router = useRouter();
  const [featuredArtists, setFeaturedArtists] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [detailName, setDetailName] = useState<string | null>(null);

  async function handleSync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/song-credits-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId,
          featuredArtists: featuredArtists.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        creditCount?: number;
        unresolved?: string[];
        artists?: string[];
      };
      if (!res.ok) {
        setMsg(data.error ?? '同期に失敗しました。');
        return;
      }
      setMsg(
        Array.isArray(data.unresolved) && data.unresolved.length > 0
          ? `一部のみ反映しました（${data.creditCount ?? 0} 件）: ${(data.artists ?? []).join(', ')}。未解決: ${data.unresolved.join(', ')}`
          : `song_credits を更新しました（${data.creditCount ?? 0} 件）: ${(data.artists ?? []).join(', ')}`,
      );
      setFeaturedArtists('');
      router.refresh();
    } catch {
      setMsg('同期に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  const main = (mainArtist ?? '').trim();

  return (
    <div className="mt-4 rounded border border-violet-900/50 bg-violet-950/15 p-3">
      <h3 className="text-sm font-semibold text-violet-200">共演アーティスト（song_credits）</h3>
      <p className="mt-2 text-xs leading-relaxed text-gray-400">
        表示上のメイン表記は{' '}
        <span className="inline-flex items-center gap-1.5 align-middle">
          <AdminArtistPhoto url={artistImageUrl} name={main} size={40} />
          <strong className="text-gray-300">{main || '（未設定）'}</strong>
        </span>{' '}
        です。各クレジットから詳細・編集を開けます。サブ／共演者をカンマ区切りで追加し、
        <code className="text-gray-500">song_credits</code> を再構築できます。反映の正本は上の番号リストです（display_title はメイン表記のままです）。
      </p>

      {initialCredits.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-xs text-gray-300">
          {initialCredits.map((c) => (
            <li
              key={`${c.artistId}-${c.displayOrder}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
            >
              <span>
                <span className="text-gray-500">{c.displayOrder + 1}.</span> {c.artistName}
                <span className="ml-2 text-gray-500">({c.role})</span>
                {c.isNewArtist ? (
                  <span className="ml-2 inline-block align-middle">
                    <AdminNewArtistBadge />
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => setDetailName(c.artistName)}
                className="text-sky-400 hover:underline"
              >
                詳細
              </button>
              <Link
                href={`/admin/domestic-artist-register/${c.artistId}`}
                className="text-emerald-400 hover:underline"
              >
                編集
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-gray-500">登録済みクレジットはありません。</p>
      )}

      <label className="mt-3 block text-xs text-gray-400">
        追加する共演アーティスト（カンマ区切り）
        <input
          className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-gray-100"
          value={featuredArtists}
          onChange={(e) => setFeaturedArtists(e.target.value)}
          placeholder="宇多田ヒカル"
          disabled={!main}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSync()}
          disabled={busy || !main || !featuredArtists.trim()}
          className="rounded bg-violet-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600 disabled:opacity-40"
        >
          {busy ? '同期中…' : 'song_credits を更新'}
        </button>
      </div>
      {msg ? (
        <p
          className={
            msg.includes('未解決') || msg.includes('一部のみ')
              ? 'mt-2 text-xs text-amber-300'
              : 'mt-2 text-xs text-gray-300'
          }
        >
          {msg}
        </p>
      ) : null}
      {detailName ? (
        <AdminArtistProfileModal
          artistName={detailName}
          currentSongId={songId}
          modalEmbed={modalEmbed}
          onClose={() => setDetailName(null)}
        />
      ) : null}
    </div>
  );
}
