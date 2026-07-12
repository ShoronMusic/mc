'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props = {
  artistId: string;
  artistName: string;
  songCount: number;
};

/**
 * 曲参照のない重複スタブ等を削除する。
 */
export function AdminArtistDeletePanel({ artistId, artistName, songCount }: Props) {
  const router = useRouter();
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const blockedBySongs = songCount > 0;

  const onDelete = async () => {
    if (blockedBySongs) return;
    const ok = window.confirm(
      `「${artistName}」を artists から削除します。\n曲参照がある場合は拒否されます。\nよろしいですか？`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    setInfo(null);
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
        return;
      }
      setInfo('削除しました。一覧へ戻ります…');
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
        曲が紐づいていない重複行（例: 英語表記だけの空行）を消すための操作です。
        正本へ寄せたい場合は「選曲登録アーティスト」の自動マージを優先してください。
      </p>
      {blockedBySongs ? (
        <p className="mt-3 text-amber-200/90">
          この画面上で曲一覧が {songCount} 件あるため削除できません。先にマージするか、曲の
          main_artist を正本に直してください。
        </p>
      ) : (
        <>
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
        </>
      )}
      {error && <p className="mt-2 text-red-300">{error}</p>}
      {info && <p className="mt-2 text-emerald-300">{info}</p>}
    </section>
  );
}
