'use client';

/**
 * 左右カラムと右側のプレイヤー/履歴の境界をドラッグでリサイズ可能にするラッパー。
 * 子は [chatNode, playerNode, historyNode] の3つを render props で受け取る想定。
 */

import { useCallback, useRef, useState } from 'react';

const MIN_LEFT_PCT = 20;
const MAX_LEFT_PCT = 80;
const MIN_TOP_PCT = 25;
const MAX_TOP_PCT = 85;
const DIVIDER_WIDTH = 6;
const DIVIDER_HEIGHT = 6;

const STORAGE_LEFT = 'mc:resize:leftPct';
const STORAGE_RIGHT_TOP = 'mc:resize:rightTopPct';

function loadStored(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = parseFloat(localStorage.getItem(key) ?? '');
    if (Number.isFinite(v)) return Math.min(max, Math.max(min, v));
  } catch {}
  return fallback;
}

function saveStored(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

interface ResizableSectionProps {
  /** 左カラム（チャット） */
  left: React.ReactNode;
  /** 右カラム上（URL入力 + プレイヤー + NowPlaying） */
  rightTop: React.ReactNode;
  /** 右カラム下（視聴履歴） */
  rightBottom: React.ReactNode;
  /** true のとき、上下分割カラムを左側に配置する（右は単一カラム） */
  splitOnLeft?: boolean;
}

export default function ResizableSection({
  left,
  rightTop,
  rightBottom,
  splitOnLeft = false,
}: ResizableSectionProps) {
  const [leftPct, setLeftPct] = useState(() => loadStored(STORAGE_LEFT, 40, MIN_LEFT_PCT, MAX_LEFT_PCT));
  const [rightTopPct, setRightTopPct] = useState(() => loadStored(STORAGE_RIGHT_TOP, 58, MIN_TOP_PCT, MAX_TOP_PCT));

  const sectionRef = useRef<HTMLDivElement>(null);
  const rightColRef = useRef<HTMLDivElement>(null);
  const draggingLR = useRef(false);
  const draggingTB = useRef(false);

  const startHorizontal = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingLR.current = true;
    const onMove = (ev: MouseEvent) => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(MAX_LEFT_PCT, Math.max(MIN_LEFT_PCT, pct));
      setLeftPct(clamped);
      saveStored(STORAGE_LEFT, clamped);
    };
    const onUp = () => {
      draggingLR.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const startVertical = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingTB.current = true;
    const onMove = (ev: MouseEvent) => {
      const el = rightColRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      const clamped = Math.min(MAX_TOP_PCT, Math.max(MIN_TOP_PCT, pct));
      setRightTopPct(clamped);
      saveStored(STORAGE_RIGHT_TOP, clamped);
    };
    const onUp = () => {
      draggingTB.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return (
    <section ref={sectionRef} className="flex min-h-0 flex-1 overflow-hidden">
      {splitOnLeft ? (
        <>
          {/* 左: プレイヤー + 履歴 */}
          <div ref={rightColRef} className="flex min-h-0 shrink-0 flex-col overflow-hidden" style={{ width: `${leftPct}%` }}>
            <div
              className="flex min-h-0 shrink-0 flex-col gap-2 overflow-hidden"
              style={{ height: `${rightTopPct}%` }}
            >
              {rightTop}
            </div>
            <button
              type="button"
              aria-label="プレイヤーと履歴の高さを変更"
              className="shrink-0 cursor-row-resize border-0 bg-gray-700 hover:bg-gray-600 focus:outline-none"
              style={{ minHeight: DIVIDER_HEIGHT, height: DIVIDER_HEIGHT }}
              onMouseDown={startVertical}
            />
            <div className="min-h-0 flex-1 overflow-hidden">
              {rightBottom}
            </div>
          </div>

          <button
            type="button"
            aria-label="左右の幅を変更"
            className="shrink-0 cursor-col-resize border-0 bg-gray-700 hover:bg-gray-600 focus:outline-none"
            style={{ width: DIVIDER_WIDTH }}
            onMouseDown={startHorizontal}
          />

          {/* 右: チャット */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
            {left}
          </div>
        </>
      ) : (
        <>
          {/* 左: チャット */}
          <div className="flex min-h-0 shrink-0 flex-col gap-2 overflow-hidden" style={{ width: `${leftPct}%` }}>
            {left}
          </div>

          {/* 左右リサイズハンドル */}
          <button
            type="button"
            aria-label="左右の幅を変更"
            className="shrink-0 cursor-col-resize border-0 bg-gray-700 hover:bg-gray-600 focus:outline-none"
            style={{ width: DIVIDER_WIDTH }}
            onMouseDown={startHorizontal}
          />

          {/* 右: プレイヤー + 履歴 */}
          <div ref={rightColRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div
              className="flex min-h-0 shrink-0 flex-col gap-2 overflow-hidden"
              style={{ height: `${rightTopPct}%` }}
            >
              {rightTop}
            </div>

            {/* 上下リサイズハンドル */}
            <button
              type="button"
              aria-label="プレイヤーと履歴の高さを変更"
              className="shrink-0 cursor-row-resize border-0 bg-gray-700 hover:bg-gray-600 focus:outline-none"
              style={{ minHeight: DIVIDER_HEIGHT, height: DIVIDER_HEIGHT }}
              onMouseDown={startVertical}
            />

            <div className="min-h-0 flex-1 overflow-hidden">
              {rightBottom}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
