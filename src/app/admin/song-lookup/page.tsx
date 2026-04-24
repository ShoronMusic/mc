'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import type { SongLookupDateBlock, SongLookupLibraryComment, SongLookupRecommendRow } from '@/lib/admin-song-lookup';

type ApiOk = {
  videoId: string;
  displayLabel: string;
  watchUrl: string;
  warnings: string[];
  libraryComments: SongLookupLibraryComment[];
  recommendations: SongLookupRecommendRow[];
  dateBlocks: SongLookupDateBlock[];
  exportText: string;
  playbackRowCount: number;
  days: number;
};

export default function AdminSongLookupPage() {
  const [q, setQ] = useState('');
  const [days, setDays] = useState(120);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiOk | null>(null);

  const runSearch = useCallback(async () => {
    const key = q.trim();
    if (!key) {
      setError('検索キーを入力してください。');
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const sp = new URLSearchParams({ q: key, days: String(days) });
      const res = await fetch(`/api/admin/song-lookup?${sp}`, { credentials: 'include' });
      const json = (await res.json().catch(() => ({}))) as ApiOk & { error?: string };
      if (!res.ok) {
        setError(json?.error || '取得に失敗しました。');
        return;
      }
      setData(json as ApiOk);
    } catch {
      setError('取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [q, days]);

  const downloadText = useCallback(() => {
    if (!data?.exportText) return;
    const slug = data.videoId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const blob = new Blob([data.exportText], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `song-lookup-${slug}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [data]);

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-5xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">曲引き</h1>
          <Link href="/admin" className="text-sm text-sky-400 hover:underline">
            ← ダッシュボード
          </Link>
        </div>

        <section className="mb-6 rounded-lg border border-gray-700 bg-gray-900/50 p-4 text-sm text-gray-400">
          <p className="leading-relaxed">
            <strong className="text-gray-300">STYLE_ADMIN</strong> かつログイン済みで利用します。キーは{' '}
            <strong className="text-gray-300">YouTube の video ID</strong>（11 文字）または{' '}
            <strong className="text-gray-300">URL</strong>、または <strong className="text-gray-300">曲ダッシュボード検索に近い表記</strong>
            （例: Bruce Springsteen - Born in the U.S.A.）です。
          </p>
          <p className="mt-2 leading-relaxed">
            同一曲の複数回再生は <strong className="text-gray-300">日付（JST）</strong>で区切り、新しい日付から表示します。テキストは画面下部のボタンで保存（DL）できます。
          </p>
        </section>

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <label className="min-w-[240px] flex-1 text-xs text-gray-400">
            検索キー
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="例: dQw4w9WgXcQ または アーティスト - タイトル"
              className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-gray-400">
            視聴履歴の参照日数
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 120)}
              className="mt-1 block rounded border border-gray-600 bg-gray-800 px-2 py-2 text-sm"
            >
              <option value={30}>30</option>
              <option value={60}>60</option>
              <option value={120}>120</option>
              <option value={180}>180</option>
              <option value={365}>365</option>
            </select>
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runSearch()}
            className="rounded bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-40"
          >
            {loading ? '検索中…' : '検索'}
          </button>
        </div>

        {error ? <p className="mb-4 text-sm text-red-300">{error}</p> : null}

        {data ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-lg font-semibold text-white">{data.displayLabel}</p>
                <p className="mt-1 font-mono text-xs text-gray-500">
                  video_id: {data.videoId} / 視聴行: {data.playbackRowCount}
                </p>
                <a
                  href={data.watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-sm text-sky-400 hover:underline"
                >
                  {data.watchUrl}
                </a>
              </div>
              <button
                type="button"
                onClick={downloadText}
                className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
              >
                TEXT 保存（DL）
              </button>
            </div>

            {data.warnings.length > 0 ? (
              <ul className="mb-4 list-inside list-disc rounded border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-100/95">
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}

            <section className="mb-6">
              <h2 className="mb-2 text-sm font-medium text-gray-300">1. 曲解説（ライブラリ・最大5件）</h2>
              <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/40 p-3">
                {data.libraryComments.length === 0 ? (
                  <p className="text-sm text-gray-500">該当なし</p>
                ) : (
                  data.libraryComments.map((c) => (
                    <div key={`${c.source}-${c.created_at}`} className="border-b border-gray-800 pb-3 last:border-0">
                      <p className="text-xs text-gray-500">
                        {c.source} · {c.created_at}
                      </p>
                      <pre className="mt-1 whitespace-pre-wrap text-sm text-gray-200">{c.body}</pre>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="mb-6">
              <h2 className="mb-2 text-sm font-medium text-gray-300">2. 曲クイズと正解</h2>
              <p className="mb-2 text-xs text-gray-500">
                DB に設問・選択肢・正解インデックスはありません。日別ブロックに「出題システム行」の時刻のみ出します。
              </p>
            </section>

            <section className="mb-6">
              <h2 className="mb-2 text-sm font-medium text-gray-300">3. おすすめ曲（next_song_recommendations）</h2>
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-gray-700 bg-gray-800/80 text-xs text-gray-400">
                    <tr>
                      <th className="px-2 py-2">推薦曲</th>
                      <th className="px-2 py-2">理由</th>
                      <th className="px-2 py-2">順</th>
                      <th className="px-2 py-2">active</th>
                      <th className="px-2 py-2">登録日時</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recommendations.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-2 py-4 text-center text-gray-500">
                          該当なし
                        </td>
                      </tr>
                    ) : (
                      data.recommendations.map((r) => (
                        <tr key={r.id} className="border-b border-gray-800">
                          <td className="px-2 py-2 text-gray-200">
                            {[r.recommended_artist, r.recommended_title].filter(Boolean).join(' - ') || '—'}
                          </td>
                          <td className="max-w-[280px] truncate px-2 py-2 text-gray-400" title={r.reason ?? ''}>
                            {r.reason ?? '—'}
                          </td>
                          <td className="px-2 py-2 text-gray-400">{r.order_index ?? '—'}</td>
                          <td className="px-2 py-2 text-gray-400">{r.is_active === false ? '×' : '○'}</td>
                          <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-gray-500">{r.created_at}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="mb-2 text-sm font-medium text-gray-300">4. 日別（JST・新しい順）— 再生・曲解説（チャット推定）・クイズ時刻・@Q&amp;A</h2>
              {data.dateBlocks.length === 0 ? (
                <p className="text-sm text-gray-500">指定期間に room_playback_history の再生がありません。</p>
              ) : (
                <div className="space-y-6">
                  {data.dateBlocks.map((block) => (
                    <DateBlockView key={block.dateJst} block={block} />
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-gray-800 bg-black/30 p-3">
              <h2 className="mb-2 text-sm font-medium text-gray-400">プレビュー（TEXT 先頭 2,000 文字）</h2>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-gray-500">
                {data.exportText.slice(0, 2000)}
                {data.exportText.length > 2000 ? '\n…' : ''}
              </pre>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function DateBlockView({ block }: { block: SongLookupDateBlock }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/35 p-4">
      <h3 className="border-b border-gray-700 pb-2 font-mono text-base text-amber-200/95">{block.dateJst}</h3>

      <h4 className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-500">再生</h4>
      <ul className="mt-1 space-y-1 text-sm text-gray-300">
        {block.plays.map((p) => (
          <li key={`${p.room_id}-${p.played_at}`}>
            <span className="font-mono text-xs text-gray-500">{p.played_at}</span> · room{' '}
            <code className="text-sky-300/90">{p.room_id}</code> ·{' '}
            {[p.artist_name, p.title].filter(Boolean).join(' — ') || '—'}
          </li>
        ))}
      </ul>

      <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-gray-500">曲解説（チャット [NEW]/[DB]・最大5/日）</h4>
      {block.liveCommentaries.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500">該当なし</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {block.liveCommentaries.map((c) => (
            <li key={`${c.room_id}-${c.created_at}`} className="rounded border border-gray-800 bg-gray-950/50 p-2">
              <p className="text-xs text-gray-500">
                {c.created_at} · room <code className="text-sky-300/90">{c.room_id}</code>
              </p>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-sm text-gray-200">{c.body}</pre>
            </li>
          ))}
        </ul>
      )}

      <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-gray-500">曲クイズ（システム行のみ）</h4>
      {block.quizMarkers.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500">該当なし</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm text-gray-400">
          {block.quizMarkers.map((m) => (
            <li key={`${m.room_id}-${m.created_at}`}>
              <span className="font-mono text-xs">{m.created_at}</span> · {m.room_id}: {m.body}
            </li>
          ))}
        </ul>
      )}

      <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-gray-500">@ 質問と AI 回答</h4>
      {block.atQaPairs.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500">該当なし</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {block.atQaPairs.map((p, i) => (
            <li key={`${p.room_id}-${p.userCreatedAt}-${i}`} className="rounded border border-gray-800 bg-gray-950/40 p-2">
              <p className="text-xs text-gray-500">
                {p.userCreatedAt} · {p.userDisplayName} · room <code className="text-sky-300/90">{p.room_id}</code>
              </p>
              <p className="mt-1 text-sm text-gray-200">Q: {p.userBody}</p>
              <p className="mt-1 text-xs text-gray-500">{p.aiCreatedAt}</p>
              <p className="text-sm text-gray-300">A: {p.aiBody}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
