'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { musicLibraryChartTextIsDark } from '@/lib/music-library-artist-charts';
import type { MusicLibraryArtistCharts, MusicLibraryChartSlice } from '@/lib/music-library-types';
import { IS_MC_PRODUCT } from '@/lib/product-branding';

function StackedStyleBar({ slices, ready }: { slices: MusicLibraryChartSlice[]; ready: boolean }) {
  if (slices.length === 0) return null;
  return (
    <div
      className={
        IS_MC_PRODUCT
          ? 'flex h-11 overflow-hidden rounded-full bg-gray-100 shadow-inner'
          : 'flex h-11 overflow-hidden rounded-full bg-black/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
      }
      role="img"
      aria-label={slices.map((s) => `${s.label} ${s.percent}%`).join('、')}
    >
      {slices.map((slice) => {
        const darkText = musicLibraryChartTextIsDark(slice.color);
        const inner = (
          <span
            className={`flex h-full items-center justify-center overflow-hidden px-2 text-[11px] font-semibold tracking-wide ${
              darkText ? 'text-gray-900' : 'text-white'
            }`}
          >
            {slice.percent >= 14 ? `${slice.label} ${slice.percent}%` : slice.percent >= 8 ? `${slice.percent}%` : null}
          </span>
        );
        const className =
          'block h-full min-w-0 overflow-hidden transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full';
        const style = {
          width: ready ? `${slice.percent}%` : '0%',
          backgroundColor: slice.color,
        };
        if (slice.href) {
          return (
            <Link
              key={slice.key}
              href={slice.href}
              title={`${slice.label} ${slice.percent}%（${slice.count}曲）`}
              className={`${className} hover:brightness-110`}
              style={style}
            >
              {inner}
            </Link>
          );
        }
        return (
          <div key={slice.key} className={className} style={style} title={`${slice.label} ${slice.percent}%`}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function StyleLegend({ slices }: { slices: MusicLibraryChartSlice[] }) {
  const text = IS_MC_PRODUCT ? 'text-gray-600' : 'text-gray-300';
  const link = IS_MC_PRODUCT ? 'hover:text-gray-900' : 'hover:text-white';
  return (
    <ul className={`mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs ${text}`}>
      {slices.map((slice) => {
        const body = (
          <>
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: slice.color }} aria-hidden />
            {slice.label} ({slice.percent}%)
          </>
        );
        return (
          <li key={slice.key}>
            {slice.href ? (
              <Link href={slice.href} className={`inline-flex items-center gap-1.5 ${link}`}>
                {body}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function GenreRows({ slices, ready }: { slices: MusicLibraryChartSlice[]; ready: boolean }) {
  const nameClass = IS_MC_PRODUCT ? 'text-sm font-medium text-gray-800' : 'text-sm font-medium text-gray-200';
  const pctClass = IS_MC_PRODUCT
    ? 'tabular-nums text-sm font-semibold text-gray-700'
    : 'tabular-nums text-sm font-semibold text-gray-200';
  const track = IS_MC_PRODUCT ? 'bg-gray-100' : 'bg-black/50';
  return (
    <ul className="space-y-2.5">
      {slices.map((slice) => (
        <li key={slice.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.75rem] items-center gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_3rem]">
          <span className={`leading-tight ${nameClass}`}>{slice.label}</span>
          <div className={`h-5 overflow-hidden rounded-full ${track}`}>
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: ready ? `${Math.min(100, slice.percent)}%` : '0%',
                backgroundColor: slice.color,
              }}
              title={`${slice.count}曲`}
            />
          </div>
          <span className={`text-right ${pctClass}`}>{slice.percent}%</span>
        </li>
      ))}
    </ul>
  );
}

export function MusicLibraryArtistCharts({ charts }: { charts: MusicLibraryArtistCharts }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  if (charts.styles.length === 0 && charts.genres.length === 0) return null;

  const mc = IS_MC_PRODUCT;
  const card = mc
    ? 'overflow-hidden rounded-xl border border-gray-200 bg-white px-4 py-5 shadow-[0_16px_48px_-28px_rgba(0,0,0,0.35)] sm:px-5'
    : 'overflow-hidden rounded-xl border border-gray-700 bg-gray-900/70 px-4 py-5 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.9)] sm:px-5';
  const heading = mc
    ? 'text-sm font-semibold tracking-wide text-gray-900'
    : 'text-sm font-semibold tracking-wide text-white';

  return (
    <section className={card}>
      {charts.styles.length > 0 ? (
        <div>
          <h2 className={heading}>Style Breakdown</h2>
          <div className="mt-3">
            <StackedStyleBar slices={charts.styles} ready={ready} />
            <StyleLegend slices={charts.styles} />
          </div>
        </div>
      ) : null}

      {charts.genres.length > 0 ? (
        <div
          className={
            charts.styles.length > 0
              ? mc
                ? 'mt-6 border-t border-gray-200 pt-6'
                : 'mt-6 border-t border-gray-800 pt-6'
              : ''
          }
        >
          <h2 className={heading}>Top Genres</h2>
          <div className="mt-3">
            <GenreRows slices={charts.genres} ready={ready} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
