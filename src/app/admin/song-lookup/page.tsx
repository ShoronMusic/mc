'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { isValidSongQuizTheme, SONG_QUIZ_THEME_UI_LABEL } from '@/lib/song-quiz-types';
import type {
  SongAdminReport,
  SongReportAtRow,
  SongReportQuizDb,
  SongReportRecommendRound,
  SongReportSelectionRow,
} from '@/lib/admin-song-lookup';

type ApiOk = SongAdminReport & {
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
    a.download = `song-report-${slug}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [data]);

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-5xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">曲引き（曲レポート）</h1>
          <Link href="/admin" className="text-sm text-sky-400 hover:underline">
            ← ダッシュボード
          </Link>
        </div>

        <section className="mb-6 rounded-lg border border-gray-700 bg-gray-900/50 p-4 text-sm text-gray-400">
          <p className="leading-relaxed">
            キーは <strong className="text-gray-300">YouTube ID / URL</strong> または{' '}
            <strong className="text-gray-300">曲名検索</strong>。アーティスト・タイトル・URL・DB 解説・選曲履歴・
            <strong className="text-gray-300"> song_quiz_logs のクイズ</strong>（新規）・おすすめ曲バッチ（各最大3）・@ 質問をまとめます。
          </p>
        </section>

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <label className="min-w-[240px] flex-1 text-xs text-gray-400">
            検索キー
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="例: video ID または アーティスト - タイトル"
              className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-gray-400">
            参照日数
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
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-white">
                  {data.artist || '—'} — {data.songTitle || '—'}
                </p>
                <p className="mt-1 text-sm text-gray-400">表示名: {data.displayTitle}</p>
                <p className="mt-1 font-mono text-xs text-gray-500">
                  video_id: {data.videoId} / 選曲行: {data.playbackRowCount}
                </p>
                <a
                  href={data.watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm text-sky-400 hover:underline"
                >
                  {data.watchUrl}
                </a>
              </div>
              <button
                type="button"
                onClick={downloadText}
                className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
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

            <ReportBody data={data} />
          </>
        ) : null}
      </div>
    </main>
  );
}

function ReportBody({ data }: { data: ApiOk }) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 border-b border-gray-700 pb-1 text-sm font-medium text-gray-300">解説（DB）</h2>
        {!data.commentaryDb ? (
          <p className="text-sm text-gray-500">該当なし</p>
        ) : (
          <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
            <p className="text-xs text-gray-500">
              {data.commentaryDb.source} · {data.commentaryDb.updated_at}
            </p>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-sm text-gray-200">{data.commentaryDb.body}</pre>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 border-b border-gray-700 pb-1 text-sm font-medium text-gray-300">
          選曲履歴（日付・部屋名・選曲者）
        </h2>
        {data.selectionHistory.length === 0 ? (
          <p className="text-sm text-gray-500">該当なし</p>
        ) : (
          <ul className="space-y-2 text-sm text-gray-200">
            {data.selectionHistory.map((s) => (
              <SelectionRow key={`${s.room_id}-${s.played_at}-${s.selector_display_name}`} s={s} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 border-b border-gray-700 pb-1 text-sm font-medium text-gray-300">
          クイズ（質問・三択・正解・解説）日付順
        </h2>
        {data.quizzesDb.length === 0 ? (
          <p className="text-sm text-gray-500">該当なし（未生成、または song_quiz_logs 未作成）</p>
        ) : (
          <ul className="space-y-4">
            {data.quizzesDb.map((q) => (
              <QuizCard key={q.id} q={q} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 border-b border-gray-700 pb-1 text-sm font-medium text-gray-300">
          おすすめ曲（各バッチ最大3・日付順）
        </h2>
        {data.recommendationRounds.length === 0 ? (
          <p className="text-sm text-gray-500">該当なし</p>
        ) : (
          <ul className="space-y-4">
            {data.recommendationRounds.map((round) => (
              <RecommendRound key={round.created_at} round={round} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 border-b border-gray-700 pb-1 text-sm font-medium text-gray-300">
          @ 質問と回答
        </h2>
        {data.atQuestions.length === 0 ? (
          <p className="text-sm text-gray-500">該当なし</p>
        ) : (
          <ul className="space-y-4">
            {data.atQuestions.map((a, i) => (
              <AtCard key={`${a.room_id}-${a.user_created_at}-${i}`} a={a} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-800 bg-black/30 p-3">
        <h2 className="mb-2 text-sm font-medium text-gray-400">TEXT 先頭 2,000 文字</h2>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-gray-500">
          {data.exportText.slice(0, 2000)}
          {data.exportText.length > 2000 ? '\n…' : ''}
        </pre>
      </section>
    </div>
  );
}

function SelectionRow({ s }: { s: SongReportSelectionRow }) {
  return (
    <li className="rounded border border-gray-800 bg-gray-900/35 px-3 py-2">
      <span className="font-mono text-xs text-amber-200/90">{s.date_jst}</span>{' '}
      <span className="font-mono text-xs text-gray-400">{s.played_at}</span>
      <div className="mt-1">
        部屋: <span className="text-sky-200/90">「{s.room_display_title}」</span>
        <code className="ml-1 text-xs text-gray-500">({s.room_id})</code>
      </div>
      <div className="mt-0.5">
        選曲者: <strong className="text-gray-100">{s.selector_display_name}</strong>
      </div>
      {(s.snapshot_artist || s.snapshot_title) && (
        <div className="mt-1 text-xs text-gray-500">
          履歴表記: {[s.snapshot_artist, s.snapshot_title].filter(Boolean).join(' - ') || '—'}
        </div>
      )}
    </li>
  );
}

function QuizCard({ q }: { q: SongReportQuizDb }) {
  const sq = q.quiz;
  const themeLabel = sq.theme && isValidSongQuizTheme(sq.theme) ? SONG_QUIZ_THEME_UI_LABEL[sq.theme] : null;
  return (
    <li className="rounded-lg border border-emerald-900/40 bg-emerald-950/15 p-3">
      <p className="text-xs text-gray-500">
        {q.date_jst} · {q.created_at} · room {q.room_id ?? '—'}
      </p>
      {q.commentary_preview ? (
        <p className="mt-1 line-clamp-2 text-xs text-gray-500" title={q.commentary_preview}>
          曲解説コンテキスト先頭: {q.commentary_preview}
        </p>
      ) : null}
      <p className="mt-2 text-sm font-medium text-white">{sq.question}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-200">
        {sq.choices.map((c, i) => (
          <li key={i} className={i === sq.correctIndex ? 'font-semibold text-emerald-200' : ''}>
            {c}
            {i === sq.correctIndex ? '（正解）' : ''}
          </li>
        ))}
      </ol>
      {themeLabel ? <p className="mt-2 text-xs text-gray-400">観点: {themeLabel}</p> : null}
      <p className="mt-2 text-sm text-gray-300">解説: {sq.explanation}</p>
    </li>
  );
}

function RecommendRound({ round }: { round: SongReportRecommendRound }) {
  return (
    <li className="rounded-lg border border-gray-700 bg-gray-900/35 p-3">
      <p className="text-xs text-gray-500">
        {round.date_jst} · {round.created_at}
      </p>
      <ul className="mt-2 space-y-2">
        {round.picks.map((p) => (
          <li key={p.order_index} className="text-sm text-gray-200">
            <strong>
              {p.artist} — {p.title}
            </strong>
            <p className="mt-0.5 text-xs text-gray-400">解説: {p.reason}</p>
          </li>
        ))}
      </ul>
    </li>
  );
}

function AtCard({ a }: { a: SongReportAtRow }) {
  return (
    <li className="rounded-lg border border-gray-700 bg-gray-900/35 p-3">
      <p className="text-xs text-gray-500">
        {a.date_jst} · {a.user_created_at}
      </p>
      <p className="mt-1 text-sm">
        部屋: <span className="text-sky-200/90">「{a.room_display_title}」</span>
        <code className="ml-1 text-xs text-gray-500">({a.room_id})</code>
      </p>
      <p className="mt-1 text-sm text-gray-300">質問者: {a.questioner}</p>
      <p className="mt-2 text-sm text-gray-100">Q: {a.question}</p>
      <p className="mt-2 text-sm text-gray-300">A: {a.answer}</p>
      <p className="mt-1 text-xs text-gray-600">{a.ai_created_at}</p>
    </li>
  );
}
