'use client';

import { useCallback, useEffect, useState } from 'react';
import { SONG_ERA_OPTIONS } from '@/lib/song-era-options';

/** 視聴履歴の年代列と揃えた色 */
const ERA_BAR_COLORS: Record<string, string> = {
  'Pre-50s': '#9e9e9e',
  '50s': '#a1887f',
  '60s': '#90caf9',
  '70s': '#81c784',
  '80s': '#ffab91',
  '90s': '#ce93d8',
  '00s': '#fff176',
  '10s': '#80deea',
  '20s': '#aed581',
  Other: '#9e9e9e',
  未設定: '#6b7280',
};

type Mode = '24h' | 'last100';

interface EraDistributionModalProps {
  roomId: string;
  open: boolean;
  onClose: () => void;
}

export default function EraDistributionModal({ roomId, open, onClose }: EraDistributionModalProps) {
  const [subTab, setSubTab] = useState<Mode>('24h');
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!roomId || !open) return;
    setLoading(true);
    try {
      const mode = subTab === '24h' ? '24h' : 'last100';
      const res = await fetch(
        `/api/room-playback-era-stats?roomId=${encodeURIComponent(roomId)}&mode=${mode}`,
        { credentials: 'include' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTotal(0);
        setCounts({});
        return;
      }
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setCounts(typeof data.counts === 'object' && data.counts ? data.counts : {});
    } catch {
      setTotal(0);
      setCounts({});
    } finally {
      setLoading(false);
    }
  }, [roomId, open, subTab]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const orderedEntries = (() => {
    const keys = Object.keys(counts);
    const seen = new Set<string>();
    const out: [string, number][] = [];
    for (const s of SONG_ERA_OPTIONS) {
      if (counts[s] != null && counts[s]! > 0) {
        out.push([s, counts[s]!]);
        seen.add(s);
      }
    }
    if (counts['未設定'] && !seen.has('未設定')) {
      out.push(['未設定', counts['未設定']]);
      seen.add('未設定');
    }
    for (const k of keys) {
      if (!seen.has(k)) out.push([k, counts[k]!]);
    }
    out.sort((a, b) => b[1] - a[1]);
    return out;
  })();

  const maxCount = orderedEntries.reduce((m, [, n]) => Math.max(m, n), 0);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="era-dist-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-gray-600 bg-gray-900 p-4 text-gray-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="era-dist-title" className="text-base font-semibold text-white">
            年代分布
          </h2>
          <button
            type="button"
            className="rounded border border-gray-600 bg-gray-800 px-3 py-1 text-xs text-gray-200 hover:bg-gray-700"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>

        <div className="mb-3 flex gap-1 rounded-lg border border-gray-700 bg-gray-800/50 p-0.5">
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition ${
              subTab === '24h'
                ? 'bg-gray-700 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => setSubTab('24h')}
          >
            過去24時間
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition ${
              subTab === 'last100'
                ? 'bg-gray-700 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => setSubTab('last100')}
          >
            過去100曲
          </button>
        </div>

        <p className="mb-2 text-xs text-gray-500">
          {subTab === '24h'
            ? 'この部屋で直近24時間に再生された履歴の年代内訳です（song_era を参照）。'
            : 'この部屋の視聴履歴を新しい順に最大100件まで集計した年代内訳です。'}
        </p>

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500">読み込み中…</p>
        ) : total === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">対象の履歴がありません。</p>
        ) : (
          <div className="max-h-[50vh] space-y-2 overflow-auto pr-1">
            <p className="text-xs text-gray-400">合計 {total} 件</p>
            {orderedEntries.map(([label, n]) => {
              const pct = maxCount > 0 ? Math.round((n / maxCount) * 100) : 0;
              const color = ERA_BAR_COLORS[label] ?? '#78909c';
              return (
                <div key={label} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-gray-200" title={label}>
                      {label}
                    </span>
                    <span className="flex-shrink-0 tabular-nums text-gray-400">
                      {n}（{total > 0 ? Math.round((n / total) * 100) : 0}%）
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded bg-gray-800">
                    <div
                      className="h-full rounded transition-[width]"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
