'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import {
  getMaPublicOrigin,
  getProductDisplayNamePlain,
  IS_MC_PRODUCT,
  MA_TITLE_LOGO_SRC,
  MC_MA_PROMO_HEADER,
} from '@/lib/product-branding';

/** 点線枠を黒バナー外側にずらす余白（px） */
const DASH_RING_OUTSET = 4;

/** 一時オフ — トップのブロック版。部屋ヘッダーは McMaPromoHeaderBanner を使用 */
const MC_MA_PROMO_BLOCK_BANNER_VISIBLE = false;

/** mc トップのブロック導線（部屋では McMaPromoHeaderBanner） */
export function McMaPromoBanner({ className = '' }: { className?: string }) {
  if (!MC_MA_PROMO_BLOCK_BANNER_VISIBLE) {
    return null;
  }

  const maOrigin = getMaPublicOrigin();

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 text-sm leading-relaxed shadow-sm ${
        IS_MC_PRODUCT
          ? 'border-gray-300 bg-gray-50 text-gray-800'
          : 'border-sky-300 bg-sky-50 text-sky-950'
      } ${className}`.trim()}
      role="note"
    >
      <p className={`font-semibold ${IS_MC_PRODUCT ? 'text-gray-900' : 'text-sky-900'}`}>
        AI に曲を解説してほしい方へ
      </p>
      <p className={`mt-1 text-xs ${IS_MC_PRODUCT ? 'text-gray-600' : 'text-sky-800/90'}`}>
        <a
          href={maOrigin}
          className={
            IS_MC_PRODUCT
              ? 'font-medium text-gray-900 underline underline-offset-2 hover:text-black'
              : 'font-medium text-sky-700 underline underline-offset-2 hover:text-sky-900'
          }
        >
          {getProductDisplayNamePlain() === 'Music Chat'
            ? '洋楽AIチャット'
            : getProductDisplayNamePlain()}
        </a>
        {' '}
        — 登録で AI 付き選曲 10 曲無料
      </p>
    </div>
  );
}

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
  const maName = '洋楽AIチャット';
  const pad = DASH_RING_OUTSET;
  const ringW = shellSize.w + pad * 2;
  const ringH = shellSize.h + pad * 2;
  const rectInset = pad - 1;

  return (
    <a
      href={maOrigin}
      target="_blank"
      rel="noopener noreferrer"
      className={`${MC_MA_PROMO_HEADER} hidden shrink-0 self-center sm:inline-flex ${className}`.trim()}
      style={{ margin: pad }}
      title={`${maName}（AI曲解説・選曲参加・同じアカウントで利用可）`}
      aria-label={`${maName}へ — AIの曲解説や選曲参加で一人でも楽しめる。同じアカウントで利用可`}
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
          src={MA_TITLE_LOGO_SRC}
          alt=""
          width={36}
          height={36}
          className="relative z-[1] h-9 w-9 shrink-0 object-contain"
        />
        <span className="mc-ma-promo-header-copy relative z-[1] min-w-0 text-left text-[10px] leading-snug sm:text-[11px]">
          <span className="mc-ma-promo-header-title block font-medium">AIの曲解説や選曲参加で一人でも楽しめる！</span>
          <span className="mc-ma-promo-header-sub">
            {maName}
            <span className="mc-ma-promo-header-muted"> — 同じアカウントで利用可</span>
          </span>
        </span>
      </span>
    </a>
  );
}
