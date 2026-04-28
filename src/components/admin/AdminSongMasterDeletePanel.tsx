'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  songId: string;
  /** 確認入力に使う文字列（通常は display_title。空のときは songId） */
  confirmLabel: string;
};

export function AdminSongMasterDeletePanel({ songId, confirmLabel }: Props) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const placeholder = confirmLabel.trim() ? confirmLabel : songId;

  async function handleDelete() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/song-master-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId, confirmText: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error || '削除に失敗しました。');
        return;
      }
      router.replace('/admin/library');
      router.refresh();
    } catch {
      setMsg('削除に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded border border-red-900/60 bg-red-950/20 p-3">
      <h3 className="text-sm font-semibold text-red-300">曲マスタの削除（誤登録・テレコ修正）</h3>
      <p className="mt-2 text-xs leading-relaxed text-gray-400">
        メインアーティストと曲名が入れ替わっているなど、<strong className="text-gray-300">誤った 1 曲 1 行</strong>
        を取り除くときに使います。紐づく <code className="text-gray-500">song_videos</code>・
        <code className="text-gray-500">song_tidbits</code>・<code className="text-gray-500">song_commentary</code>・
        <code className="text-gray-500">comment_feedback</code>（該当行）も削除します。視聴履歴は残ります。
      </p>
      <p className="mt-2 text-xs text-amber-200/90">
        下の文字列をコピーして入力してください（<strong className="text-amber-100">英字の大文字／小文字の違いは照合時に無視</strong>
        。スマート引用符・ダッシュも近い形に揃えて照合します）。
      </p>
      <p className="mt-1 break-all rounded bg-gray-950/80 px-2 py-1 font-mono text-[11px] text-gray-200">
        {placeholder}
      </p>
      <label className="mt-3 block text-xs text-gray-500">
        確認入力
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-red-700 focus:outline-none"
          placeholder={placeholder}
        />
      </label>
      {msg && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {msg}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (!text.trim()) {
            setMsg('確認テキストを入力してください。');
            return;
          }
          void handleDelete();
        }}
        className="mt-3 rounded bg-red-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? '削除中…' : 'この曲マスタを削除する'}
      </button>
    </div>
  );
}
