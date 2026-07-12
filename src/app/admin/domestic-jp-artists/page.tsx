'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type Row = {
  id: string;
  artist_name: string;
  name_key: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export default function AdminDomesticJpArtistsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newNote, setNewNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch('/api/admin/domestic-jp-artists', { credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        hint?: string;
        rows?: Row[];
      };
      if (!res.ok) {
        setRows([]);
        setError(data.error ?? '読み込みに失敗しました。');
        setHint(typeof data.hint === 'string' ? data.hint : null);
        return;
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch {
      setRows([]);
      setError('読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createRow = useCallback(async () => {
    const artistName = newName.trim();
    if (!artistName) {
      alert('アーティスト名を入力してください。');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/domestic-jp-artists', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_name: artistName,
          note: newNote.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; row?: Row };
      if (!res.ok) {
        alert(data.error ?? '登録に失敗しました。');
        return;
      }
      if (data.row) {
        setRows((prev) =>
          [...prev, data.row!].sort((a, b) => a.artist_name.localeCompare(b.artist_name, 'ja')),
        );
      } else {
        await load();
      }
      setNewName('');
      setNewNote('');
    } finally {
      setCreating(false);
    }
  }, [load, newName, newNote]);

  const startEdit = useCallback((row: Row) => {
    setEditingId(row.id);
    setEditName(row.artist_name);
    setEditNote(row.note ?? '');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditName('');
    setEditNote('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    setSavingId(editingId);
    try {
      const res = await fetch('/api/admin/domestic-jp-artists', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          artist_name: editName.trim(),
          note: editNote.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; row?: Row };
      if (!res.ok) {
        alert(data.error ?? '保存に失敗しました。');
        return;
      }
      if (data.row) {
        setRows((prev) =>
          prev
            .map((r) => (r.id === editingId ? data.row! : r))
            .sort((a, b) => a.artist_name.localeCompare(b.artist_name, 'ja')),
        );
      } else {
        await load();
      }
      cancelEdit();
    } finally {
      setSavingId(null);
    }
  }, [cancelEdit, editName, editNote, editingId, load]);

  const deleteRow = useCallback(
    async (id: string, artistName: string) => {
      if (!confirm(`「${artistName}」を削除しますか？`)) return;
      setDeletingId(id);
      try {
        const res = await fetch(
          `/api/admin/domestic-jp-artists?id=${encodeURIComponent(id)}`,
          { method: 'DELETE', credentials: 'include' },
        );
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          alert(data.error ?? '削除に失敗しました。');
          return;
        }
        setRows((prev) => prev.filter((r) => r.id !== id));
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />
      <h1 className="mb-2 text-xl font-semibold text-white">邦楽扱い英字アーティスト</h1>
      <p className="mb-6 max-w-3xl text-sm text-gray-400">
        英字表記のため洋楽と誤判定されやすい邦楽アーティストを登録します。選曲時の邦楽 DB 登録・
        <code className="rounded bg-gray-800 px-1">catalog_scope</code>・管理画面の邦楽一覧に反映されます。
        YouTube チャンネル名の「Official Channel」付き表記からも照合します（例: Mr.Children Official Channel）。
        照合は小文字化＋空白除去後の完全一致です（例: Mr.Children → mrchildren）。
        テーブル未作成時は Mr.Children のみコード内フォールバックがあります。
      </p>

      {error && (
        <p className="mb-4 rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100/95">
          {error}
          {hint ? <span className="mt-1 block text-xs text-amber-200/80">{hint}</span> : null}
        </p>
      )}

      <section className="mb-8 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
        <h2 className="mb-3 text-sm font-medium text-gray-200">新規登録</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-xs text-gray-400">
            アーティスト名
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={120}
              placeholder="例: Mr.Children / Official髭男dism"
              className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
            />
          </label>
          <label className="flex flex-[1.2] flex-col gap-1 text-xs text-gray-400">
            メモ（任意）
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              maxLength={500}
              placeholder="運用メモ"
              className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
            />
          </label>
          <button
            type="button"
            onClick={() => void createRow()}
            disabled={creating}
            className="rounded bg-sky-700 px-4 py-2 text-sm text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {creating ? '登録中…' : '登録'}
          </button>
        </div>
      </section>

      {loading ? (
        <p className="text-sm text-gray-400">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">登録がありません（Mr.Children はコード内フォールバックあり）。</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900/40">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800/80">
              <tr>
                <th className="px-3 py-2">アーティスト名</th>
                <th className="px-3 py-2">照合キー</th>
                <th className="px-3 py-2">メモ</th>
                <th className="px-3 py-2">更新日時</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isEditing = editingId === r.id;
                return (
                  <tr key={r.id} className="border-b border-gray-800/80 align-top">
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={120}
                          className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-sm"
                        />
                      ) : (
                        r.artist_name
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-400">{r.name_key}</td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          maxLength={500}
                          className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-sm"
                        />
                      ) : (
                        r.note ?? '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {new Date(r.updated_at).toLocaleString('ja-JP')}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void saveEdit()}
                            disabled={savingId === r.id}
                            className="rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(r)}
                            className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteRow(r.id, r.artist_name)}
                            disabled={deletingId === r.id}
                            className="rounded border border-red-900/60 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                          >
                            削除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
