'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminArtistProfileModal } from '@/components/admin/AdminArtistProfileModal';
import { AdminNewArtistBadge } from '@/components/admin/AdminNewArtistBadge';
import type { AdminSongArtistLink } from '@/lib/admin-song-artist-links';

export type AdminArtistConfirmedLinkItem = AdminSongArtistLink;

type Props = {
  /** メイン＋共演。空なら何も出さない */
  artists: AdminArtistConfirmedLinkItem[];
  currentSongId: string;
  modalEmbed?: boolean;
};

export function AdminArtistConfirmedLinks({
  artists,
  currentSongId,
  modalEmbed = false,
}: Props) {
  const router = useRouter();
  const list = artists
    .map((a) => ({
      id: a.id.trim(),
      name: a.name.trim(),
      isNewArtist: Boolean(a.isNewArtist),
      spotifyArtistId: (a.spotifyArtistId ?? '').trim() || null,
      kind: a.kind,
      unresolved: Boolean(a.unresolved) || !a.id.trim(),
    }))
    .filter((a) => a.name);

  const [openName, setOpenName] = useState<string | null>(null);
  const [idByArtist, setIdByArtist] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msgByArtist, setMsgByArtist] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const a of list) {
      next[a.id] = a.spotifyArtistId ?? '';
    }
    setIdByArtist(next);
  }, [artists]);

  if (list.length === 0) return null;

  async function runFetchById(artist: (typeof list)[number]): Promise<void> {
    const raw = (idByArtist[artist.id] ?? '').trim();
    if (!raw) {
      setMsgByArtist((prev) => ({
        ...prev,
        [artist.id]: 'Spotify の artist ID またはアーティスト URL を入力してください。',
      }));
      return;
    }
    const existing = (artist.spotifyArtistId ?? '').trim();
    if (existing && existing !== raw && !raw.includes(existing)) {
      const ok = window.confirm(
        `既存の artist ID（${existing}）を、入力した ID で上書きして Spotify から再取得します。実行しますか？`,
      );
      if (!ok) return;
    }

    setBusyId(artist.id);
    setMsgByArtist((prev) => ({ ...prev, [artist.id]: '' }));
    try {
      const res = await fetch('/api/admin/artist-spotify-by-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ artistId: artist.id, spotifyArtistId: raw }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        spotifyArtistId?: string | null;
        spotifyArtistName?: string | null;
        spotifyArtistPopularity?: number | null;
      };
      if (!res.ok) {
        setMsgByArtist((prev) => ({
          ...prev,
          [artist.id]: data.error ?? '指定 ID からの Spotify 取得に失敗しました。',
        }));
        return;
      }
      if (data.spotifyArtistId) {
        setIdByArtist((prev) => ({ ...prev, [artist.id]: data.spotifyArtistId ?? '' }));
      }
      setMsgByArtist((prev) => ({
        ...prev,
        [artist.id]: data.message ?? '反映しました。',
      }));
      router.refresh();
    } catch {
      setMsgByArtist((prev) => ({
        ...prev,
        [artist.id]: '指定 ID からの Spotify 取得に失敗しました。',
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="space-y-2">
        <p className="text-[11px] text-gray-500">
          アーティスト詳細・編集（{list.length} 名）
        </p>
        <p className="text-[11px] leading-relaxed text-gray-500">
          メイン（先頭）とサブをまとめて表示します。Spotify の artist ID / URL
          を入れて人気度・画像を取得できます。「アーティストを編集」でプロフィール全体を直せます。
        </p>
        <ul className="space-y-2">
          {list.map((a) => (
            <li
              key={a.id || `name:${a.name}:${a.kind ?? ''}`}
              className="rounded border border-gray-800 bg-gray-950/50 p-2.5"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="min-w-0 font-medium text-gray-200">{a.name}</span>
                {a.kind === 'main' ? (
                  <span className="text-[10px] text-gray-500">メイン</span>
                ) : a.kind === 'credit' ? (
                  <span className="text-[10px] text-gray-500">サブ</span>
                ) : null}
                {a.unresolved ? (
                  <span className="text-[10px] text-amber-400">マスタ未紐づけ</span>
                ) : null}
                {a.isNewArtist ? <AdminNewArtistBadge /> : null}
                <button
                  type="button"
                  onClick={() => setOpenName(a.name)}
                  className="text-sky-400 hover:underline"
                >
                  アーティスト詳細
                </button>
                {a.id ? (
                  <Link
                    href={`/admin/domestic-artist-register/${a.id}`}
                    className="text-emerald-400 hover:underline"
                  >
                    アーティストを編集
                  </Link>
                ) : (
                  <span className="text-[11px] text-gray-500">編集するには artists への紐づけが必要です</span>
                )}
              </div>
              {a.id ? (
                <>
              <label className="mt-2 block text-[11px] text-gray-400">
                Spotify artist ID / URL
                <input
                  value={idByArtist[a.id] ?? ''}
                  onChange={(e) =>
                    setIdByArtist((prev) => ({ ...prev, [a.id]: e.target.value }))
                  }
                  placeholder="https://open.spotify.com/artist/… または 22文字 ID"
                  className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 font-mono text-xs text-gray-100"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  disabled={busyId === a.id || !(idByArtist[a.id] ?? '').trim()}
                  onClick={() => void runFetchById(a)}
                  className="rounded bg-green-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === a.id ? '取得中…' : 'この ID で Spotify から取得'}
                </button>
                {(idByArtist[a.id] ?? '').trim().length === 22 ? (
                  <a
                    href={`https://open.spotify.com/artist/${encodeURIComponent((idByArtist[a.id] ?? '').trim())}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-sky-300 hover:underline"
                  >
                    Spotify で開く
                  </a>
                ) : null}
              </div>
              {msgByArtist[a.id] ? (
                <p className="mt-1.5 text-[11px] text-green-100" role="status">
                  {msgByArtist[a.id]}
                </p>
              ) : null}
                </>
              ) : null}
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
