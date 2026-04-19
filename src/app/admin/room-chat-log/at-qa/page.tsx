'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type AtPair = {
  userDisplayName: string;
  userBody: string;
  userCreatedAt: string;
  aiBody: string;
  aiCreatedAt: string;
  objectionIds: string[];
};

type ObjectionRow = {
  id: string;
  created_at: string;
  reason_keys: string[] | null;
  free_comment: string | null;
  system_message_body: string;
  reviewed_at: string | null;
};

type ApiOk = {
  roomId: string;
  dateJst: string;
  gatheringId: string | null;
  truncated: boolean;
  rowCount: number;
  pairCount: number;
  pairs: AtPair[];
  objections: ObjectionRow[];
};

function formatTs(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

export default function AdminRoomChatAtQaPage() {
  const searchParams = useSearchParams();
  const roomId = (searchParams.get('roomId') ?? '').trim();
  const dateJst = (searchParams.get('date') ?? '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [data, setData] = useState<ApiOk | null>(null);

  const canLoad = roomId.length > 0 && dateJst.length > 0;

  const load = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const q = new URLSearchParams({ roomId, date: dateJst });
      const res = await fetch(`/api/admin/room-chat-log-at-qa?${q}`, { credentials: 'include' });
      const json = (await res.json().catch(() => ({}))) as ApiOk & { error?: string; hint?: string };
      if (!res.ok) {
        setError(json?.error || '読み込みに失敗しました。');
        setHint(json?.hint ?? null);
        setData(null);
        return;
      }
      setData(json as ApiOk);
    } catch {
      setError('読み込みに失敗しました。');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [canLoad, roomId, dateJst]);

  useEffect(() => {
    void load();
  }, [load]);

  const objectionById = useMemo(() => {
    const m = new Map<string, ObjectionRow>();
    for (const o of data?.objections ?? []) {
      m.set(o.id, o);
    }
    return m;
  }, [data]);

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-4xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">@ 質問と AI 回答（会話ログから）</h1>
          <Link
            href="/admin/room-chat-log"
            className="text-sm text-sky-400 hover:underline"
          >
            ← 部屋の会話ログ一覧
          </Link>
        </div>

        <section className="mb-6 rounded-lg border border-gray-700 bg-gray-900/50 p-4 text-sm text-gray-400">
          <p>
            <strong className="text-gray-300">STYLE_ADMIN_USER_IDS</strong> かつログイン済みで閲覧できます。
            <code className="mx-1 rounded bg-gray-800 px-1 text-gray-200">room_chat_log</code>
            の JST 1 日分から、「ユーザー行が @／＠ で始まる → 直後（システム行を除く）の AI 行」を 1 組として抽出しています。
          </p>
          <p className="mt-2">
            同日・同部屋の <strong className="text-gray-300">質問ガード異議</strong>
            （<code className="rounded bg-gray-800 px-1">ai_question_guard_objections</code>
            ）で、会話スナップショット内の @ 本文と一致したものがあれば
            <strong className="text-amber-300"> 異議あり </strong>
            と付記します（突合は正規化後の文字列一致・部分一致。誤結合の可能性は残ります）。
          </p>
          <p className="mt-2">
            一覧から開く: 会話ログの行の「
            <span className="text-sky-400">{'＠Q&A'}</span>
            」リンク。手動の URL 例:{' '}
            <code className="break-all text-gray-300">
              /admin/room-chat-log/at-qa?roomId=部屋ID&amp;date=2026-04-18
            </code>
          </p>
        </section>

        {!canLoad && (
          <p className="text-gray-500">
            <code className="text-gray-400">roomId</code> と <code className="text-gray-400">date</code>{' '}
            （YYYY-MM-DD）をクエリに付けてください。
          </p>
        )}

        {error && (
          <div className="mb-4 space-y-1 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-amber-200">
            <p>{error}</p>
            {hint && <p className="text-sm text-amber-300/90">{hint}</p>}
          </div>
        )}

        {loading && <p className="text-gray-400">読み込み中…</p>}

        {!loading && data && (
          <>
            <p className="mb-4 text-sm text-gray-500">
              部屋 <span className="font-mono text-gray-300">{data.roomId}</span> / {data.dateJst}{' '}
              <span className="text-gray-600">（JST）</span>
              <span className="ml-2">保存行数: {data.rowCount}</span>
              <span className="ml-2">@ ペア数: {data.pairCount}</span>
              {data.truncated && (
                <span className="ml-2 text-amber-400">（行数上限で打ち切り）</span>
              )}
            </p>

            {data.pairs.length === 0 ? (
              <p className="text-gray-500">該当する @→AI の組はありません。</p>
            ) : (
              <ol className="space-y-6">
                {data.pairs.map((p, idx) => (
                  <li
                    key={`${p.userCreatedAt}-${idx}`}
                    className="rounded-lg border border-gray-700 bg-gray-900/40 p-4"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span>#{idx + 1}</span>
                      <span>{formatTs(p.userCreatedAt)}</span>
                      {p.objectionIds.length > 0 && (
                        <span className="rounded bg-amber-900/50 px-2 py-0.5 font-medium text-amber-200">
                          異議あり（{p.objectionIds.length} 件）
                        </span>
                      )}
                    </div>
                    <p className="mb-1 text-xs text-gray-500">
                      {p.userDisplayName} <span className="text-gray-600">（@ 質問）</span>
                    </p>
                    <pre className="mb-4 whitespace-pre-wrap break-words rounded bg-gray-950/80 p-3 text-sm text-gray-200">
                      {p.userBody}
                    </pre>
                    <p className="mb-1 text-xs text-gray-500">
                      AI <span className="text-gray-600">（{formatTs(p.aiCreatedAt)}）</span>
                    </p>
                    <pre className="whitespace-pre-wrap break-words rounded bg-gray-950/80 p-3 text-sm text-gray-200">
                      {p.aiBody}
                    </pre>
                    {p.objectionIds.length > 0 && (
                      <ul className="mt-3 space-y-2 border-t border-gray-800 pt-3 text-sm text-amber-100/90">
                        {p.objectionIds.map((oid) => {
                          const o = objectionById.get(oid);
                          if (!o) return null;
                          return (
                            <li key={oid} className="rounded border border-amber-900/40 bg-amber-950/20 p-2">
                              <div className="text-xs text-amber-200/80">
                                異議 {formatTs(o.created_at)}
                                {o.reviewed_at ? (
                                  <span className="ml-2 text-emerald-400/90">確認済</span>
                                ) : (
                                  <span className="ml-2 text-gray-500">未確認</span>
                                )}
                              </div>
                              {o.reason_keys && o.reason_keys.length > 0 && (
                                <div className="mt-1 font-mono text-xs text-amber-100/70">
                                  理由: {o.reason_keys.join(', ')}
                                </div>
                              )}
                              {o.free_comment && (
                                <div className="mt-1 text-gray-300">コメント: {o.free_comment}</div>
                              )}
                              {o.system_message_body && (
                                <div className="mt-1 text-xs text-gray-500">
                                  警告文抜粋: {o.system_message_body.slice(0, 160)}
                                  {o.system_message_body.length > 160 ? '…' : ''}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {data.objections.length > 0 && (
              <section className="mt-10 border-t border-gray-800 pt-6">
                <h2 className="mb-2 text-lg font-medium text-gray-200">
                  同日・同部屋の質問ガード異議（全 {data.objections.length} 件）
                </h2>
                <p className="mb-3 text-sm text-gray-500">
                  上のペアに結び付かなかった異議（ブロックされ AI 行が無いケース等）も含みます。{' '}
                  <Link href="/admin/ai-question-guard-objections" className="text-sky-400 hover:underline">
                    異議一覧（管理）
                  </Link>
                </p>
                <ul className="space-y-2 text-sm">
                  {data.objections.map((o) => (
                    <li key={o.id} className="rounded border border-gray-800 bg-gray-900/30 p-3 font-mono text-xs text-gray-400">
                      <span className="text-gray-300">{o.id}</span>
                      <span className="mx-2">{formatTs(o.created_at)}</span>
                      {o.reason_keys?.join(',')}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
