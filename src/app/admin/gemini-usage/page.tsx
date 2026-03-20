'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type LogRow = {
  id: string;
  context: string;
  model: string;
  prompt_token_count: number | null;
  output_token_count: number | null;
  total_token_count: number | null;
  room_id: string | null;
  video_id: string | null;
  created_at: string;
};

const CONTEXT_HELP: Record<string, string> = {
  chat_reply: 'チャットへの AI 返答',
  tidbit: '30秒無発言の豆知識（再生中・直前の曲に紐づくもののみ。洋楽全般の雑談はオフ）',
  commentary: '曲解説（曲を貼った直後の基本コメント）',
  get_song_style: '曲スタイル分類（Pop/Rock 等）',
  extract_song_search: '「曲を貼って」系の検索クエリ抽出',
  comment_pack_base: 'comment-pack の基本コメント',
  comment_pack_free_1: 'comment-pack 自由コメント1',
  comment_pack_free_2: 'comment-pack 自由コメント2',
  comment_pack_free_3: 'comment-pack 自由コメント3',
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP');
  } catch {
    return iso;
  }
}

export default function AdminGeminiUsagePage() {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState({ calls: 0, promptTokens: 0, outputTokens: 0 });
  const [byContext, setByContext] = useState<Record<string, { calls: number; promptTokens: number; outputTokens: number }>>({});
  const [logs, setLogs] = useState<LogRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/gemini-usage?days=${days}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || '読み込みに失敗しました。');
        setLogs([]);
        setTotals({ calls: 0, promptTokens: 0, outputTokens: 0 });
        setByContext({});
        return;
      }
      setTotals(data.totals ?? { calls: 0, promptTokens: 0, outputTokens: 0 });
      setByContext(data.byContext ?? {});
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      setError('読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const ctxEntries = Object.entries(byContext).sort((a, b) => b[1].calls - a[1].calls);

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Gemini 利用ログ</h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              期間
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="rounded border border-gray-600 bg-gray-800 px-2 py-1"
              >
                <option value={1}>過去1日</option>
                <option value={7}>過去7日</option>
                <option value={30}>過去30日</option>
                <option value={90}>過去90日</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => load()}
              className="rounded bg-gray-700 px-3 py-1 text-sm hover:bg-gray-600"
            >
              再読込
            </button>
            <Link href="/admin/songs" className="text-sm text-blue-400 hover:underline">
              曲管理へ
            </Link>
          </div>
        </div>

        <section className="mb-6 rounded-lg border border-gray-700 bg-gray-900/50 p-4 text-sm">
          <h2 className="mb-2 font-medium text-gray-200">どんなログか</h2>
          <ul className="list-inside list-disc space-y-1 text-gray-400">
            <li>
              <strong className="text-gray-300">入力トークン</strong>（prompt）… プロンプト・会話履歴の量。料金の入力単価に掛け算。
            </li>
            <li>
              <strong className="text-gray-300">出力トークン</strong>（output）… AI が返した文字量。料金の出力単価に掛け算。
            </li>
            <li>
              <strong className="text-gray-300">context</strong>… どの機能で呼んだか（下表の「種別」）。
            </li>
            <li>
              保存には <code className="rounded bg-gray-800 px-1">SUPABASE_SERVICE_ROLE_KEY</code> とテーブル{' '}
              <code className="rounded bg-gray-800 px-1">gemini_usage_logs</code> が必要です（
              <code className="rounded bg-gray-800 px-1">docs/supabase-gemini-usage-logs-table.md</code>）。
            </li>
            <li>
              コンソールだけ見たい場合は <code className="rounded bg-gray-800 px-1">GEMINI_LOG_USAGE=1</code>。
            </li>
          </ul>
        </section>

        {error && (
          <p className="mb-4 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-amber-200">{error}</p>
        )}

        {loading ? (
          <p className="text-gray-400">読み込み中…</p>
        ) : (
          <>
            <section className="mb-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">呼び出し回数（期間内）</div>
                <div className="text-2xl font-semibold">{totals.calls.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">入力トークン合計</div>
                <div className="text-2xl font-semibold text-sky-300">{totals.promptTokens.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">出力トークン合計</div>
                <div className="text-2xl font-semibold text-emerald-300">{totals.outputTokens.toLocaleString()}</div>
              </div>
            </section>

            <section className="mb-6">
              <h2 className="mb-2 text-sm font-medium text-gray-300">種別ごとの内訳</h2>
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-gray-700 bg-gray-800/80">
                    <tr>
                      <th className="px-3 py-2">種別（context）</th>
                      <th className="px-3 py-2">説明</th>
                      <th className="px-3 py-2 text-right">回数</th>
                      <th className="px-3 py-2 text-right">入力</th>
                      <th className="px-3 py-2 text-right">出力</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ctxEntries.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-gray-500">
                          データがありません
                        </td>
                      </tr>
                    ) : (
                      ctxEntries.map(([key, v]) => (
                        <tr key={key} className="border-b border-gray-800">
                          <td className="px-3 py-1.5 font-mono text-xs text-gray-300">{key}</td>
                          <td className="px-3 py-1.5 text-gray-400">{CONTEXT_HELP[key] ?? '—'}</td>
                          <td className="px-3 py-1.5 text-right">{v.calls}</td>
                          <td className="px-3 py-1.5 text-right text-sky-200/90">{v.promptTokens.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-200/90">{v.outputTokens.toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-sm font-medium text-gray-300">直近の記録（最大400件）</h2>
              <div className="max-h-[480px] overflow-auto rounded-lg border border-gray-700">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="sticky top-0 border-b border-gray-700 bg-gray-800/95">
                    <tr>
                      <th className="px-2 py-1.5">日時</th>
                      <th className="px-2 py-1.5">種別</th>
                      <th className="px-2 py-1.5 text-right">入力</th>
                      <th className="px-2 py-1.5 text-right">出力</th>
                      <th className="px-2 py-1.5">room</th>
                      <th className="px-2 py-1.5">video</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((r) => (
                      <tr key={r.id} className="border-b border-gray-800/80">
                        <td className="whitespace-nowrap px-2 py-1 text-gray-400">{formatTime(r.created_at)}</td>
                        <td className="px-2 py-1 font-mono text-gray-300">{r.context}</td>
                        <td className="px-2 py-1 text-right">{r.prompt_token_count ?? '—'}</td>
                        <td className="px-2 py-1 text-right">{r.output_token_count ?? '—'}</td>
                        <td className="max-w-[80px] truncate px-2 py-1 text-gray-500" title={r.room_id ?? ''}>
                          {r.room_id ?? '—'}
                        </td>
                        <td className="max-w-[100px] truncate px-2 py-1 text-gray-500" title={r.video_id ?? ''}>
                          {r.video_id ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
