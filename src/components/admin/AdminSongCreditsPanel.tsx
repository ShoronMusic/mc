'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type AdminSongCreditRow = {
  artistId: string;
  artistName: string;
  role: string;
  displayOrder: number;
};

type Props = {
  songId: string;
  mainArtist: string | null;
  initialCredits: AdminSongCreditRow[];
};

export function AdminSongCreditsPanel({ songId, mainArtist, initialCredits }: Props) {
  const router = useRouter();
  const [featuredArtists, setFeaturedArtists] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
      const unresolved =
        Array.isArray(data.unresolved) && data.unresolved.length > 0
          ? `（未解決: ${data.unresolved.join(', ')}）`
          : '';
      setMsg(
        `song_credits を更新しました（${data.creditCount ?? 0} 件）: ${(data.artists ?? []).join(', ')}${unresolved}`,
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
        メインは <strong className="text-gray-300">{main || '（未設定）'}</strong>{' '}
        です。サブ／共演者をカンマ区切りで追加し、<code className="text-gray-500">song_credits</code>{' '}
        を再構築します（artists マスタに無い名前は自動作成を試みます）。
      </p>

      {initialCredits.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-gray-300">
          {initialCredits.map((c) => (
            <li key={`${c.artistId}-${c.displayOrder}`}>
              <span className="text-gray-500">{c.displayOrder + 1}.</span> {c.artistName}
              <span className="ml-2 text-gray-500">({c.role})</span>
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
      {msg ? <p className="mt-2 text-xs text-gray-300">{msg}</p> : null}
    </div>
  );
}
