'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type TuningRow = {
  id: string;
  created_at: string;
  reporter_user_id: string;
  reporter_email: string | null;
  room_id: string;
  anchor_message_id: string;
  anchor_message_type: string;
  current_video_id: string | null;
  moderator_note: string;
  conversation_snapshot: unknown;
  reviewed_at: string | null;
  reviewed_by: string | null;
  admin_note: string | null;
};

export default function AdminAiChatTuningReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [rows, setRows] = useState<TuningRow[]>([]);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch('/api/admin/ai-chat-tuning-reports?limit=100', {
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        hint?: string;
        rows?: TuningRow[];
        total?: number;
      };
      if (!res.ok) {
        setError(data?.error || '読み込みに失敗しました。');
        setHint(data?.hint ?? null);
        setRows([]);
        setTotal(0);
        return;
      }
      const list = Array.isArray(data.rows) ? data.rows : [];
      setRows(list);
      setTotal(typeof data.total === 'number' ? data.total : list.length);
      setNotes((prev) => {
        const next = { ...prev };
        for (const r of list) {
          if (next[r.id] === undefined && r.admin_note) {
            next[r.id] = r.admin_note;
          }
        }
        return next;
      });
    } catch {
      setError('読み込みに失敗しました。');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchRow(id: string, opts?: { reviewed?: boolean }) {
    setSavingId(id);
    try {
      const payload: Record<string, unknown> = {
        id,
        adminNote: notes[id]?.trim() ?? '',
      };
      if (opts && typeof opts.reviewed === 'boolean') {
        payload.reviewed = opts.reviewed;
      }
      const res = await fetch('/api/admin/ai-chat-tuning-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || '更新に失敗しました。');
        return;
      }
      await load();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-5xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">AI チャットチューニング報告</h1>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/admin/ai-chat-tuning-reports/export?format=json"
              className="rounded bg-cyan-900/60 px-3 py-1 text-sm text-cyan-100 hover:bg-cyan-800/70"
            >
              JSON エクスポート
            </a>
            <a
              href="/api/admin/ai-chat-tuning-reports/export?format=csv"
              className="rounded bg-cyan-900/60 px-3 py-1 text-sm text-cyan-100 hover:bg-cyan-800/70"
            >
              CSV エクスポート
            </a>
            <button
              type="button"
              onClick={() => load()}
              className="rounded bg-gray-700 px-3 py-1 text-sm hover:bg-gray-600"
              disabled={loading}
            >
              再読込
            </button>
          </div>
        </div>

        <p className="mb-4 text-sm text-gray-400">
          <code className="text-gray-300">AI_TIDBIT_MODERATOR_USER_IDS</code>{' '}
          から送られた会話スナップショットです。プロンプト・ポリシー調整の参照用にエクスポートできます。テーブル作成は{' '}
          <code className="text-gray-300">docs/supabase-setup.md</code> 11.2 です。
        </p>

        {error ? (
          <p className="mb-4 rounded border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            {error}
            {hint ? <span className="mt-1 block text-xs text-rose-300/90">{hint}</span> : null}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-gray-500">読み込み中…</p>
        ) : (
          <p className="mb-2 text-xs text-gray-500">件数: {total}</p>
        )}

        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleString('ja-JP')} / 部屋{' '}
                    <code className="text-amber-200/90">{r.room_id}</code> / 基準{' '}
                    <code className="text-gray-400">{r.anchor_message_type}</code>
                    {r.current_video_id ? (
                      <>
                        {' '}
                        / video <code className="text-gray-400">{r.current_video_id}</code>
                      </>
                    ) : null}
                  </p>
                  <p className="whitespace-pre-wrap text-gray-200">{r.moderator_note}</p>
                  <p className="text-xs text-gray-500">
                    報告者: {r.reporter_email ?? r.reporter_user_id}
                  </p>
                  {r.reviewed_at ? (
                    <p className="text-xs text-emerald-400/90">
                      確認済み {new Date(r.reviewed_at).toLocaleString('ja-JP')}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {!r.reviewed_at ? (
                    <button
                      type="button"
                      disabled={savingId === r.id}
                      onClick={() => patchRow(r.id, { reviewed: true })}
                      className="rounded bg-emerald-800/80 px-2 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {savingId === r.id ? '保存中…' : '確認済みにする'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={savingId === r.id}
                      onClick={() => patchRow(r.id, { reviewed: false })}
                      className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-50"
                    >
                      未確認に戻す
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={savingId === r.id}
                    onClick={() => patchRow(r.id)}
                    className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-50"
                  >
                    メモだけ保存
                  </button>
                </div>
              </div>
              <label className="mt-2 block text-xs text-gray-500">
                運営メモ（任意）
                <textarea
                  value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-200"
                  placeholder="対応メモ・プロンプト案など"
                />
              </label>
              <button
                type="button"
                className="mt-1 text-xs text-cyan-400/90 underline"
                onClick={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
              >
                {expanded === r.id ? '会話スナップショットを隠す' : '会話スナップショットを表示'}
              </button>
              {expanded === r.id ? (
                <pre className="mt-2 max-h-64 overflow-auto rounded border border-gray-800 bg-gray-950 p-2 text-[11px] text-gray-300">
                  {JSON.stringify(r.conversation_snapshot, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>

        {!loading && rows.length === 0 && !error ? (
          <p className="text-sm text-gray-500">データがありません。</p>
        ) : null}
      </div>
    </main>
  );
}
