'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  formatAtAnswerBodyForDisplay,
  formatAtQuestionBodyForDisplay,
  type UserAtQuestionHistoryPair,
} from '@/lib/user-at-question-history';

type ApiPayload = {
  enabled?: boolean;
  hint?: string;
  pairCount?: number;
  pairs?: UserAtQuestionHistoryPair[];
  error?: string;
};

function formatTsJst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

type UserAtQuestionHistoryProps = {
  isGuest: boolean;
  className?: string;
};

export function UserAtQuestionHistory({ isGuest, className = '' }: UserAtQuestionHistoryProps) {
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [pairs, setPairs] = useState<UserAtQuestionHistoryPair[]>([]);

  const load = useCallback(async () => {
    if (isGuest) return;
    setLoading(true);
    try {
      const res = await fetch('/api/user/at-question-history?limit=30', { credentials: 'include' });
      const data = (await res.json().catch(() => null)) as ApiPayload | null;
      if (!res.ok || !data) {
        setPairs([]);
        setHint(data?.error ?? '履歴の取得に失敗しました');
        return;
      }
      if (data.enabled === false) {
        setPairs([]);
        setHint(data.hint ?? null);
        return;
      }
      setHint(null);
      setPairs(Array.isArray(data.pairs) ? data.pairs : []);
    } catch {
      setPairs([]);
      setHint('履歴の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [isGuest]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isGuest) {
    return <p className="text-sm text-gray-500">質問履歴は登録ユーザーのみ表示できます。</p>;
  }

  return (
    <div className={className} aria-label="@ 質問と AI の回答履歴">
      {loading ? (
        <p className="text-xs text-gray-500">読み込み中…</p>
      ) : hint ? (
        <p className="text-xs text-amber-200/90">{hint}</p>
      ) : pairs.length === 0 ? (
        <p className="text-sm leading-relaxed text-gray-500">
          まだ記録がありません。部屋で <span className="text-gray-400">@質問…</span>{' '}
          と送信すると、ここに質問と AI の回答が表示されます（チャットログ保存後）。
        </p>
      ) : (
        <ul className="space-y-3">
          {pairs.map((p) => {
            const q = formatAtQuestionBodyForDisplay(p.userBody);
            const a = formatAtAnswerBodyForDisplay(p.aiBody);
            const key = `${p.roomId}|${p.userCreatedAt}|${q.slice(0, 24)}`;
            return (
              <li
                key={key}
                className="rounded border border-sky-900/40 bg-sky-950/15 px-3 py-2.5 text-sm leading-relaxed"
              >
                <p className="text-[11px] text-gray-500">
                  {formatTsJst(p.userCreatedAt)}
                  {p.roomLabel ? ` · ${p.roomLabel}` : p.roomId ? ` · ${p.roomId}` : ''}
                </p>
                <p className="mt-1.5 text-sky-100">
                  <span className="font-semibold text-sky-300/90">Q </span>
                  {q}
                </p>
                <p className="mt-2 text-gray-200">
                  <span className="font-semibold text-violet-300/90">A </span>
                  {a}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-gray-600">
        部屋チャットの保存ログから表示しています（最大30件・新しい順）。直後の質問は数分後に反映されることがあります。
      </p>
    </div>
  );
}
