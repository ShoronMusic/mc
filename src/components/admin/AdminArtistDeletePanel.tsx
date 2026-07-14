'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';

type BlockingSong = {
  id: string;
  display_title: string | null;
  main_artist: string | null;
};

type Props = {
  artistId: string;
  artistName: string;
  songCount: number;
};

/**
 * 曲参照のない重複スタブ等を削除する。
 * main_artist 名一致が無く artist_id だけが刺さっている誤紐づけは解除して削除可。
 */
export function AdminArtistDeletePanel({ artistId, artistName, songCount }: Props) {
  const router = useRouter();
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [blockingSongs, setBlockingSongs] = useState<BlockingSong[]>([]);

  const onDelete = async () => {
    const ok = window.confirm(
      `「${artistName}」を artists から削除します。\n` +
        `main_artist がこの名前の曲が無い場合、誤った songs.artist_id 参照は外してから削除します。\n` +
        `よろしいですか？`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    setBlockingSongs([]);
    try {
      const res = await fetch('/api/admin/artists/delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId, confirmName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '削除に失敗しました。');
        const songs = data?.check?.blockingSongs;
        if (Array.isArray(songs)) setBlockingSongs(songs as BlockingSong[]);
        return;
      }
      const n = Array.isArray(data.unlinkedSongIds) ? data.unlinkedSongIds.length : 0;
      setInfo(
        n > 0
          ? `削除しました（誤った artist_id 参照 ${n} 件を解除）。一覧へ戻ります…`
          : '削除しました。一覧へ戻ります…',
      );
      router.push('/admin/artists-newly-registered');
      router.refresh();
    } catch {
      setError('削除に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm">
      <h2 className="text-sm font-semibold text-red-200">削除（重複スタブ向け）</h2>
      <p className="mt-2 text-xs leading-relaxed text-gray-400">
        レーベル名の誤登録や、曲が紐づいていない重複行を消す操作です。曲一覧が 0
        件でも、別曲の <code className="text-gray-300">artist_id</code>{' '}
        がこの行を指しているとブロックされますが、その曲の main_artist
        が別名なら参照を外して削除できます。
      </p>
      {songCount > 0 ? (
        <p className="mt-3 text-amber-200/90">
          この画面の曲一覧が {songCount} 件あります。main_artist
          がこの名前のままなら削除できません（先に曲側を正本へ）。
        </p>
      ) : null}
      <label className="mt-3 block text-xs text-gray-400">
        確認: アーティスト名「{artistName}」を入力
        <input
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          className="mt-1 w-full max-w-md rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-gray-100"
          placeholder={artistName}
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        disabled={busy || confirmName.trim() !== artistName.trim()}
        onClick={() => void onDelete()}
        className="mt-3 rounded bg-red-800 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? '削除中…' : 'このアーティスト行を削除'}
      </button>
      {error && <p className="mt-2 text-red-300">{error}</p>}
      {blockingSongs.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-amber-100/90">
          {blockingSongs.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/songs/${s.id}`} className="text-sky-300 hover:underline">
                {s.display_title || s.id}
              </Link>
              {s.main_artist ? (
                <span className="text-gray-500"> · main_artist: {s.main_artist}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {info && <p className="mt-2 text-emerald-300">{info}</p>}
    </section>
  );
}
