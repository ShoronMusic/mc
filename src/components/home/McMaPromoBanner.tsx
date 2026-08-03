'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import {
  getMaPublicOrigin,
  getSisterSiteAccountNoteShort,
  getSisterSiteNameJa,
  IS_MC_PRODUCT,
  MA_MARK_LOGO_SRC,
  MC_MA_PROMO_HEADER,
} from '@/lib/product-branding';

/** 点線枠を黒バナー外側にずらす余白（px） */
const DASH_RING_OUTSET = 4;

/** mc 部屋ヘッダー：退室ボタン右の ma 導線 */
export function McMaPromoHeaderBanner({ className = '' }: { className?: string }) {
  const shellRef = useRef<HTMLSpanElement>(null);
  const [shellSize, setShellSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      setShellSize({
        w: Math.max(0, Math.round(width)),
        h: Math.max(0, Math.round(height)),
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!IS_MC_PRODUCT) {
    return null;
  }

  const maOrigin = getMaPublicOrigin();
  const maName = getSisterSiteNameJa();
  const pad = DASH_RING_OUTSET;
  const ringW = shellSize.w + pad * 2;
  const ringH = shellSize.h + pad * 2;
  const rectInset = pad - 1;
  const shortNote = getSisterSiteAccountNoteShort();

  return (
    <a
      href={maOrigin}
      target="_blank"
      rel="noopener noreferrer"
      className={`${MC_MA_PROMO_HEADER} hidden shrink-0 self-center sm:inline-flex ${className}`.trim()}
      style={{ margin: pad }}
      title={`${maName}（AI曲解説・選曲参加・${shortNote}）`}
      aria-label={`${maName}へ — AIの曲解説や選曲参加で一人でも楽しめる。${shortNote}`}
    >
      <span
        ref={shellRef}
        className="mc-ma-promo-header-shell relative inline-flex max-w-sm items-center gap-2 overflow-visible rounded px-2 py-1.5 xl:max-w-md"
      >
        {shellSize.w > 0 && shellSize.h > 0 ? (
          <svg
            className="mc-ma-promo-header-dashed-border"
            width={ringW}
            height={ringH}
            viewBox={`0 0 ${ringW} ${ringH}`}
            aria-hidden
          >
            <rect
              className="mc-ma-promo-header-dashed-rect"
              x={rectInset}
              y={rectInset}
              width={shellSize.w + 2}
              height={shellSize.h + 2}
              rx={6}
              ry={6}
              fill="none"
              strokeWidth={2}
              strokeDasharray="8 4"
              strokeDashoffset={0}
            />
          </svg>
        ) : null}
        <Image
          src={MA_MARK_LOGO_SRC}
          alt=""
          width={80}
          height={80}
          className="relative z-[1] h-9 w-9 shrink-0 object-contain"
        />
        <span className="mc-ma-promo-header-copy relative z-[1] min-w-0 text-left text-[10px] leading-snug sm:text-[11px]">
          <span className="mc-ma-promo-header-title flex items-center gap-1.5 font-medium">
            <span className="min-w-0">AIの曲解説や選曲参加で一人でも楽しめる！</span>
            <span
              className="mc-ma-promo-header-go inline-flex shrink-0 items-center gap-0.5 text-[9px] font-bold tracking-wide sm:text-[10px]"
              aria-hidden
            >
              GO
              <svg
                viewBox="0 0 8 10"
                className="h-2.5 w-2"
                fill="currentColor"
                aria-hidden
              >
                <path d="M0 0 L8 5 L0 10 Z" />
              </svg>
            </span>
          </span>
          <span className="mc-ma-promo-header-sub">
            {maName}
            <span className="mc-ma-promo-header-muted"> — 姉妹サイト・同じアカウントで利用可</span>
          </span>
        </span>
      </span>
    </a>
  );
}
