'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  GUIDE_ENJOY_BADGE_LABELS,
  GUIDE_ENJOY_CORE_SECTIONS,
  GUIDE_ENJOY_INTRO,
  GUIDE_ENJOY_TAB_CATEGORIES,
  GUIDE_ENJOY_THREE_STEPS,
  GUIDE_ENJOY_USAGE_HIGHLIGHTS,
  type GuideEnjoyCategory,
  type GuideEnjoyFeatureBadge,
} from '@/lib/guide-enjoy-features';
import { guideInternalHref } from '@/lib/policy-modal-link';

function FeatureBadge({ badge }: { badge: GuideEnjoyFeatureBadge }) {
  const label = GUIDE_ENJOY_BADGE_LABELS[badge];
  const tone =
    badge === 'beta'
      ? 'border-amber-700/50 bg-amber-950/50 text-amber-200'
      : badge === 'login'
        ? 'border-sky-700/50 bg-sky-950/50 text-sky-200'
        : 'border-gray-600 bg-gray-800/80 text-gray-300';

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none ${tone}`}
    >
      {label}
    </span>
  );
}

function EnjoyCategoryPanel({
  category,
  showHeading = true,
  linkSearchParams,
}: {
  category: GuideEnjoyCategory;
  showHeading?: boolean;
  linkSearchParams?: { modal?: string; returnTo?: string };
}) {
  return (
    <section className="space-y-4" aria-labelledby={`enjoy-${category.id}`}>
      <div>
        {showHeading ? (
          <h2 id={`enjoy-${category.id}`} className="text-lg font-semibold text-white">
            {category.title}
          </h2>
        ) : (
          <h2 id={`enjoy-${category.id}`} className="sr-only">
            {category.title}
          </h2>
        )}
        <p className={`text-sm text-gray-500 ${showHeading ? 'mt-1' : ''}`}>{category.lead}</p>
      </div>
      <ul className="grid gap-3">
        {category.features.map((feature) => (
          <li
            key={feature.title}
            className="rounded-xl border border-gray-700 bg-gray-900/50 p-4 transition hover:border-gray-600"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-semibold text-white">{feature.title}</h3>
              {feature.badge ? <FeatureBadge badge={feature.badge} /> : null}
            </div>
            <p className="mt-2 text-gray-400">{feature.description}</p>
            {feature.href ? (
              <p className="mt-3">
                <Link
                  href={guideInternalHref(feature.href, linkSearchParams)}
                  className="text-sm text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
                >
                  {feature.hrefLabel ?? '詳しく見る'} →
                </Link>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GuideEnjoyFeatureList() {
  const searchParams = useSearchParams();
  const linkSearchParams = {
    modal: searchParams.get('modal') ?? undefined,
    returnTo: searchParams.get('returnTo') ?? undefined,
  };
  const [activeTabId, setActiveTabId] = useState(GUIDE_ENJOY_TAB_CATEGORIES[0]?.id ?? 'ai-support');
  const activeCategory =
    GUIDE_ENJOY_TAB_CATEGORIES.find((c) => c.id === activeTabId) ?? GUIDE_ENJOY_TAB_CATEGORIES[0];

  return (
    <article className="space-y-8 text-sm leading-relaxed text-gray-300">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {GUIDE_ENJOY_INTRO.subtitle}
        </p>
        <h1 className="text-2xl font-bold text-white">{GUIDE_ENJOY_INTRO.title}</h1>
        <p className="text-gray-400">{GUIDE_ENJOY_INTRO.lead}</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {GUIDE_ENJOY_USAGE_HIGHLIGHTS.map((pattern) => (
            <li
              key={pattern.title}
              className="rounded-xl border border-gray-700 bg-gray-900/60 p-4"
            >
              <h2 className="text-base font-semibold text-white">{pattern.title}</h2>
              <p className="mt-2 text-sm text-gray-400">{pattern.description}</p>
            </li>
          ))}
        </ul>
        <p className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 text-xs text-gray-500">
          {GUIDE_ENJOY_INTRO.note}
        </p>
      </header>

      <section className="space-y-4" aria-labelledby="enjoy-three-steps-heading">
        <h2 id="enjoy-three-steps-heading" className="text-base font-semibold text-white">
          使い方は簡単！3ステップ
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {GUIDE_ENJOY_THREE_STEPS.map((item) => (
            <li
              key={item.step}
              className="rounded-xl border border-sky-800/50 bg-sky-950/25 p-4"
            >
              <p className="text-xs font-bold tabular-nums text-sky-400">STEP {item.step}</p>
              <h3 className="mt-1 font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-gray-400">{item.description}</p>
              {item.href ? (
                <p className="mt-3">
                  <Link
                    href={guideInternalHref(item.href, linkSearchParams)}
                    className="text-sm text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
                  >
                    {item.hrefLabel ?? '詳しく見る'} →
                  </Link>
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {GUIDE_ENJOY_CORE_SECTIONS.map((section) => (
        <EnjoyCategoryPanel
          key={section.id}
          category={section}
          linkSearchParams={linkSearchParams}
        />
      ))}

      <section className="space-y-4" aria-labelledby="enjoy-tabs-heading">
        <div>
          <h2 id="enjoy-tabs-heading" className="text-base font-semibold text-white">
            もっと楽しむ
          </h2>
          <p className="mt-1 text-xs text-gray-500">タブを切り替えて、機能をカテゴリごとに確認できます。</p>
        </div>

        <div
          role="tablist"
          aria-label="機能カテゴリ"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
        >
          {GUIDE_ENJOY_TAB_CATEGORIES.map((category) => {
            const selected = category.id === activeTabId;
            const tabLabel = category.tabLabel ?? category.title;
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                id={`enjoy-tab-${category.id}`}
                aria-selected={selected}
                aria-controls={`enjoy-tabpanel-${category.id}`}
                onClick={() => setActiveTabId(category.id)}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  selected
                    ? 'bg-gray-700 text-white shadow-sm'
                    : 'bg-gray-800/80 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                {tabLabel}
              </button>
            );
          })}
        </div>

        {activeCategory ? (
          <div
            role="tabpanel"
            id={`enjoy-tabpanel-${activeCategory.id}`}
            aria-labelledby={`enjoy-tab-${activeCategory.id}`}
            className="min-h-[12rem]"
          >
            <EnjoyCategoryPanel
              category={activeCategory}
              showHeading={false}
              linkSearchParams={linkSearchParams}
            />
          </div>
        ) : null}
      </section>

      <section
        className="space-y-3 rounded-xl border border-gray-700 bg-gray-900/40 p-4"
        aria-labelledby="enjoy-next-steps"
      >
        <h2 id="enjoy-next-steps" className="text-base font-semibold text-white">
          次に読むガイド
        </h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <li>
            <Link
              href={guideInternalHref('/guide/first-song', linkSearchParams)}
              className="text-sky-400 underline-offset-2 hover:underline"
            >
              選曲のしかた
            </Link>
          </li>
          <li>
            <Link
              href={guideInternalHref('/guide/ai', linkSearchParams)}
              className="text-sky-400 underline-offset-2 hover:underline"
            >
              AI について
            </Link>
          </li>
          <li>
            <Link
              href={guideInternalHref('/guide/chat', linkSearchParams)}
              className="text-sky-400 underline-offset-2 hover:underline"
            >
              チャットのマナー
            </Link>
          </li>
          <li>
            <Link
              href={guideInternalHref('/guide', linkSearchParams)}
              className="text-sky-400 underline-offset-2 hover:underline"
            >
              ご利用上の注意（目次）
            </Link>
          </li>
        </ul>
      </section>
    </article>
  );
}
