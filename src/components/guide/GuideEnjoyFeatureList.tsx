'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  GUIDE_ENJOY_BADGE_LABELS,
  GUIDE_ENJOY_CORE_SECTIONS,
  GUIDE_ENJOY_INTRO,
  GUIDE_ENJOY_ORIGINAL_AIS,
  GUIDE_ENJOY_SONG_SELECTION,
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

function SelectionMethodDescription({
  description,
  descriptionParagraphs,
  lightTone = false,
}: {
  description: string;
  descriptionParagraphs?: readonly string[];
  lightTone?: boolean;
}) {
  const textClass = lightTone ? 'text-gray-600' : 'text-gray-400';

  if (descriptionParagraphs?.length) {
    return (
      <div className={`mt-2 space-y-2 text-sm ${textClass}`}>
        {descriptionParagraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    );
  }

  return <p className={`mt-2 text-sm ${textClass}`}>{description}</p>;
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
  const twoColGrid = category.featureGridCols === 2;

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
      <ul className={`grid gap-3 ${twoColGrid ? 'sm:grid-cols-2' : ''}`}>
        {category.features.map((feature) => {
          const imageBelow = Boolean(feature.image && twoColGrid);
          const imageBeside = Boolean(feature.image && !twoColGrid);
          const isLightCard = feature.cardTone === 'light';

          return (
          <li
            key={feature.title}
            className={`flex flex-col rounded-xl border transition ${
              isLightCard
                ? 'border-gray-200 bg-white hover:border-gray-300'
                : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
            }`}
          >
            <div
              className={
                imageBeside
                  ? 'flex flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'
                  : imageBelow
                    ? 'flex flex-1 flex-col p-4'
                    : 'flex-1 p-4'
              }
            >
              <div className={imageBeside ? 'min-w-0 flex-1 p-4 pb-0 sm:pb-4' : ''}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3
                    className={`font-semibold ${
                      isLightCard ? 'text-gray-900' : 'text-white'
                    }`}
                  >
                    {feature.title}
                  </h3>
                  {feature.badge ? <FeatureBadge badge={feature.badge} /> : null}
                </div>
                <p
                  className={`mt-2 text-sm ${
                    isLightCard ? 'text-gray-600' : 'text-gray-400'
                  }`}
                >
                  {feature.description}
                </p>
                {feature.href ? (
                  <p className="mt-3">
                    <Link
                      href={guideInternalHref(feature.href, linkSearchParams)}
                      className={`text-sm underline-offset-2 hover:underline ${
                        isLightCard
                          ? 'text-sky-700 hover:text-sky-800'
                          : 'text-sky-400 hover:text-sky-300'
                      }`}
                    >
                      {feature.hrefLabel ?? '詳しく見る'} →
                    </Link>
                  </p>
                ) : null}
              </div>
              {feature.image ? (
                <div
                  className={
                    imageBelow
                      ? 'mt-3 flex justify-center'
                      : 'flex shrink-0 justify-end px-3 py-3 sm:px-4 sm:py-4'
                  }
                >
                  <Image
                    src={feature.image.src}
                    alt={feature.image.alt}
                    width={feature.image.width}
                    height={feature.image.height}
                    className="h-auto shrink-0"
                    sizes={`${feature.image.width}px`}
                  />
                </div>
              ) : null}
            </div>
          </li>
          );
        })}
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
  const [activeSelectionStep, setActiveSelectionStep] = useState(
    GUIDE_ENJOY_SONG_SELECTION.methods[0]?.step ?? 1,
  );
  const activeCategory =
    GUIDE_ENJOY_TAB_CATEGORIES.find((c) => c.id === activeTabId) ?? GUIDE_ENJOY_TAB_CATEGORIES[0];
  const activeSelectionMethod =
    GUIDE_ENJOY_SONG_SELECTION.methods.find((m) => m.step === activeSelectionStep) ??
    GUIDE_ENJOY_SONG_SELECTION.methods[0];
  const usageHighlightImageDisplayHeight = Math.max(
    ...GUIDE_ENJOY_USAGE_HIGHLIGHTS.map((item) => Math.round(item.imageHeight * 0.9)),
  );

  return (
    <article className="space-y-8 text-sm leading-relaxed text-gray-300">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {GUIDE_ENJOY_INTRO.subtitle}
        </p>
        <h1 className="text-2xl font-bold text-white">{GUIDE_ENJOY_INTRO.title}</h1>
        <p className="text-gray-400">{GUIDE_ENJOY_INTRO.lead}</p>
        <ul className="flex flex-nowrap items-stretch gap-2 overflow-x-auto">
          {GUIDE_ENJOY_USAGE_HIGHLIGHTS.map((pattern) => {
            const imageDisplayWidth = Math.round(pattern.imageWidth * 0.9);
            const isLightCard = pattern.cardTone === 'light';

            return (
            <li
              key={pattern.title}
              className={`flex shrink-0 flex-col rounded-xl border ${
                isLightCard
                  ? 'border-gray-200 bg-white'
                  : 'border-gray-700 bg-gray-900/60'
              }`}
              style={{ width: pattern.imageWidth + 24 }}
            >
              <div className="flex-1 p-4 pb-0">
                <h2
                  className={`text-base font-semibold ${
                    isLightCard ? 'text-gray-900' : 'text-white'
                  }`}
                >
                  {pattern.title}
                </h2>
                <p
                  className={`mt-2 text-sm ${
                    isLightCard ? 'text-gray-600' : 'text-gray-400'
                  }`}
                >
                  {pattern.description}
                </p>
              </div>
              <div
                className="flex shrink-0 items-center justify-center px-3 pb-3 pt-4"
                style={{ minHeight: usageHighlightImageDisplayHeight + 16 }}
              >
                <Image
                  src={pattern.imageSrc}
                  alt={pattern.imageAlt}
                  width={pattern.imageWidth}
                  height={pattern.imageHeight}
                  className="h-auto shrink-0"
                  style={{
                    width: `${imageDisplayWidth}px`,
                    height: 'auto',
                  }}
                  sizes={`${imageDisplayWidth}px`}
                  draggable={false}
                />
              </div>
            </li>
            );
          })}
        </ul>
        <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
          {GUIDE_ENJOY_INTRO.note}
        </p>
      </header>

      <section className="space-y-4" aria-labelledby="enjoy-three-steps-heading">
        <h2 id="enjoy-three-steps-heading" className="text-base font-semibold text-white">
          使い方は簡単！3ステップ
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3 sm:items-stretch">
          {GUIDE_ENJOY_THREE_STEPS.map((item) => {
            const isLightCard = item.cardTone === 'light';

            return (
            <li
              key={item.step}
              className={`flex flex-col rounded-xl border ${
                isLightCard
                  ? 'border-gray-200 bg-white'
                  : 'border-sky-800/50 bg-sky-950/25'
              }`}
            >
              <div className="p-4 pb-0">
                <p
                  className={`text-xs font-bold tabular-nums ${
                    isLightCard ? 'text-sky-700' : 'text-sky-400'
                  }`}
                >
                  STEP {item.step}
                </p>
                <h3
                  className={`mt-1 font-semibold ${
                    isLightCard ? 'text-gray-900' : 'text-white'
                  }`}
                >
                  {item.title}
                </h3>
                <p
                  className={`mt-2 text-sm ${
                    isLightCard ? 'text-gray-600' : 'text-gray-400'
                  }`}
                >
                  {item.description}
                </p>
                {item.href ? (
                  <p className="mt-3">
                    <Link
                      href={guideInternalHref(item.href, linkSearchParams)}
                      className={`text-sm underline-offset-2 hover:underline ${
                        isLightCard
                          ? 'text-sky-700 hover:text-sky-800'
                          : 'text-sky-400 hover:text-sky-300'
                      }`}
                    >
                      {item.hrefLabel ?? '詳しく見る'} →
                    </Link>
                  </p>
                ) : null}
              </div>
              <div className="flex min-h-[8rem] flex-1 items-center justify-center px-4 py-4">
                <Image
                  src={item.imageSrc}
                  alt={item.imageAlt}
                  width={item.imageWidth}
                  height={item.imageHeight}
                  className="h-auto max-w-full shrink-0"
                  style={{
                    width: `${Math.round(item.imageWidth * 0.9)}px`,
                    height: 'auto',
                  }}
                  sizes={`${Math.round(item.imageWidth * 0.9)}px`}
                />
              </div>
            </li>
            );
          })}
        </ol>
      </section>

      <section className="space-y-4" aria-labelledby="enjoy-song-selection-heading">
        <div>
          <h2 id="enjoy-song-selection-heading" className="text-base font-semibold text-white">
            {GUIDE_ENJOY_SONG_SELECTION.title}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{GUIDE_ENJOY_SONG_SELECTION.lead}</p>
        </div>
        <div
          role="tablist"
          aria-label="選曲方法"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
        >
          {GUIDE_ENJOY_SONG_SELECTION.methods.map((item) => {
            const selected = item.step === activeSelectionStep;
            return (
              <button
                key={item.step}
                type="button"
                role="tab"
                id={`enjoy-selection-tab-${item.step}`}
                aria-selected={selected}
                aria-controls={`enjoy-selection-tabpanel-${item.step}`}
                onClick={() => setActiveSelectionStep(item.step)}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  selected
                    ? 'bg-emerald-900/60 text-emerald-100 shadow-sm ring-1 ring-emerald-700/50'
                    : 'bg-gray-800/80 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                {item.tabLabel}
              </button>
            );
          })}
        </div>
        {activeSelectionMethod ? (
          <div
            role="tabpanel"
            id={`enjoy-selection-tabpanel-${activeSelectionMethod.step}`}
            aria-labelledby={`enjoy-selection-tab-${activeSelectionMethod.step}`}
            className={`rounded-xl border ${
              activeSelectionMethod.cardTone === 'light'
                ? 'border-gray-200 bg-white'
                : 'border-emerald-800/45 bg-emerald-950/20'
            }`}
          >
            <div
              className={
                activeSelectionMethod.images?.length
                  ? 'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'
                  : 'p-4'
              }
            >
              <div
                className={
                  activeSelectionMethod.images?.length ? 'min-w-0 flex-1 p-4 pb-0 sm:pb-4' : ''
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3
                    className={`font-semibold ${
                      activeSelectionMethod.cardTone === 'light' ? 'text-gray-900' : 'text-white'
                    }`}
                  >
                    {activeSelectionMethod.title}
                  </h3>
                  {activeSelectionMethod.badge ? (
                    <FeatureBadge badge={activeSelectionMethod.badge} />
                  ) : null}
                </div>
                <SelectionMethodDescription
                  description={activeSelectionMethod.description}
                  descriptionParagraphs={activeSelectionMethod.descriptionParagraphs}
                  lightTone={activeSelectionMethod.cardTone === 'light'}
                />
                {activeSelectionMethod.href ? (
                  <p className="mt-3">
                    <Link
                      href={guideInternalHref(activeSelectionMethod.href, linkSearchParams)}
                      className={`text-sm underline-offset-2 hover:underline ${
                        activeSelectionMethod.cardTone === 'light'
                          ? 'text-sky-700 hover:text-sky-800'
                          : 'text-sky-400 hover:text-sky-300'
                      }`}
                    >
                      {activeSelectionMethod.hrefLabel ?? '詳しく見る'} →
                    </Link>
                  </p>
                ) : null}
              </div>
              {activeSelectionMethod.images?.length ? (
                <div className="flex shrink-0 flex-nowrap items-end justify-end gap-2 px-3 py-3 sm:gap-3 sm:px-4 sm:py-4">
                  {activeSelectionMethod.images.map((image) => (
                    <figure key={image.src} className="flex shrink-0 flex-col items-center">
                      {'caption' in image && image.caption ? (
                        <figcaption
                          className={`mb-1.5 text-center text-xs font-medium ${
                            activeSelectionMethod.cardTone === 'light'
                              ? 'text-gray-600'
                              : 'text-gray-300'
                          }`}
                        >
                          {image.caption}
                        </figcaption>
                      ) : null}
                      <Image
                        src={image.src}
                        alt={image.alt}
                        width={image.width}
                        height={image.height}
                        className="h-auto shrink-0"
                        sizes={`${image.width}px`}
                      />
                    </figure>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <ul className="grid gap-3 sm:grid-cols-2">
          {GUIDE_ENJOY_SONG_SELECTION.basics.map((item) => {
            const isLightCard = item.cardTone === 'light';

            return (
            <li
              key={item.title}
              className={`flex flex-col rounded-xl border p-4 ${
                isLightCard
                  ? 'border-gray-200 bg-white'
                  : 'border-gray-700 bg-gray-900/50'
              }`}
            >
              <h3
                className={`break-keep font-semibold ${
                  isLightCard ? 'text-gray-900' : 'text-white'
                }`}
              >
                {item.title}
              </h3>
              <p
                className={`mt-2 flex-1 break-keep text-sm leading-relaxed ${
                  isLightCard ? 'text-gray-600' : 'text-gray-400'
                }`}
              >
                {item.description}
              </p>
              {item.image ? (
                <div className="mt-3 flex justify-center overflow-x-auto">
                  <Image
                    src={item.image.src}
                    alt={item.image.alt}
                    width={item.image.width}
                    height={item.image.height}
                    className="h-auto w-[300px] max-w-none shrink-0"
                    sizes="300px"
                  />
                </div>
              ) : null}
            </li>
            );
          })}
        </ul>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="break-keep text-sm leading-relaxed text-gray-600">
            {GUIDE_ENJOY_SONG_SELECTION.charmText}
          </p>
          <div className="mt-3 flex justify-center overflow-x-auto">
            <Image
              src={GUIDE_ENJOY_SONG_SELECTION.charmImage.src}
              alt={GUIDE_ENJOY_SONG_SELECTION.charmImage.alt}
              width={GUIDE_ENJOY_SONG_SELECTION.charmImage.width}
              height={GUIDE_ENJOY_SONG_SELECTION.charmImage.height}
              className="h-auto shrink-0"
              style={{
                width: `${Math.round(GUIDE_ENJOY_SONG_SELECTION.charmImage.width * 0.9)}px`,
                height: 'auto',
              }}
              sizes={`${Math.round(GUIDE_ENJOY_SONG_SELECTION.charmImage.width * 0.9)}px`}
              draggable={false}
            />
          </div>
        </div>
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

        <section className="space-y-4" aria-labelledby="enjoy-original-ais-heading">
          <div>
            <h3 id="enjoy-original-ais-heading" className="text-sm font-semibold text-white">
              {GUIDE_ENJOY_ORIGINAL_AIS.title}
            </h3>
            <p className="mt-1 text-xs text-gray-500">{GUIDE_ENJOY_ORIGINAL_AIS.lead}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {GUIDE_ENJOY_ORIGINAL_AIS.roles.map((role) => (
              <li
                key={role.id}
                className="flex flex-col rounded-xl border border-gray-700 bg-gray-900/50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h4 className="font-semibold text-white">{role.title}</h4>
                  {role.badge ? <FeatureBadge badge={role.badge} /> : null}
                </div>
                <p className="mt-2 text-sm font-medium text-sky-200/90">{role.tagline}</p>
                <p className="mt-2 flex-1 text-sm text-gray-400">{role.description}</p>
                <p className="mt-3">
                  <button
                    type="button"
                    onClick={() => setActiveTabId(role.relatedTabId)}
                    className="text-sm text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
                  >
                    詳しい機能を見る →
                  </button>
                </p>
              </li>
            ))}
          </ul>
        </section>

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
