'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type CSSProperties } from 'react';
import {
  GUIDE_ENJOY_BADGE_LABELS,
  GUIDE_ENJOY_FRAME_SEC,
  GUIDE_ENJOY_CORE_SECTIONS,
  GUIDE_ENJOY_INTRO,
  GUIDE_ENJOY_ORIGINAL_AIS,
  GUIDE_ENJOY_SONG_SELECTION,
  GUIDE_ENJOY_TAB_CATEGORIES,
  GUIDE_ENJOY_THREE_STEPS,
  GUIDE_ENJOY_USAGE_HIGHLIGHTS,
  type GuideEnjoyCategory,
  type GuideEnjoyDeviceTone,
  type GuideEnjoyFeatureBadge,
  type GuideEnjoyIllustration,
  type GuideEnjoySelectionPattern,
  type GuideEnjoySelectionPreludeStep,
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

function enjoyDeviceToneClass(
  tone: GuideEnjoyDeviceTone | 'neutral' | undefined,
  lightTone: boolean,
): string {
  if (tone === 'pc') {
    return lightTone ? 'text-red-700' : 'text-red-300';
  }
  if (tone === 'mobile') {
    return lightTone ? 'text-emerald-700' : 'text-emerald-300';
  }
  return lightTone ? 'text-gray-600' : 'text-gray-400';
}

function enjoyDeviceBadgeClass(tone: GuideEnjoyDeviceTone): string {
  return tone === 'pc' ? 'bg-red-700 text-white' : 'bg-emerald-700 text-white';
}

function SelectionMethodPrelude({
  steps,
  lightTone,
}: {
  steps: readonly GuideEnjoySelectionPreludeStep[];
  lightTone: boolean;
}) {
  return (
    <ol className="space-y-2">
      {steps.map((step) => (
        <li key={step.step} className="flex items-start gap-2">
          <span
            className={`mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded px-1.5 text-xs font-bold tabular-nums ${
              lightTone ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-900'
            }`}
          >
            {step.step}
          </span>
          <div className="min-w-0 pt-0.5">
            <p
              className={`text-sm font-medium leading-relaxed ${
                lightTone ? 'text-gray-900' : 'text-white'
              }`}
            >
              {step.href ? (
                <a
                  href={step.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline-offset-2 hover:underline ${
                    lightTone ? 'text-sky-700 hover:text-sky-800' : 'text-sky-400 hover:text-sky-300'
                  }`}
                >
                  {step.title}
                </a>
              ) : (
                step.title
              )}
            </p>
            {step.description ? (
              <p className={`mt-0.5 text-sm ${lightTone ? 'text-gray-600' : 'text-gray-400'}`}>
                {step.description}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function SelectionMethodDescription({
  description,
  descriptionParagraphs,
  descriptionParagraphTones,
  descriptionParagraphFrames,
  lightTone = false,
}: {
  description: string;
  descriptionParagraphs?: readonly string[];
  descriptionParagraphTones?: readonly (GuideEnjoyDeviceTone | 'neutral')[];
  descriptionParagraphFrames?: readonly (number | null)[];
  lightTone?: boolean;
}) {
  const textClass = lightTone ? 'text-gray-600' : 'text-gray-400';
  const frameCount = descriptionParagraphFrames?.filter((frame) => frame != null).length ?? 0;
  const duration = frameCount * GUIDE_ENJOY_FRAME_SEC;

  if (descriptionParagraphs?.length) {
    return (
      <div className="mt-2 space-y-2 text-sm">
        {descriptionParagraphs.map((paragraph, index) => {
          const frame = descriptionParagraphFrames?.[index];
          const synced = frame != null && frameCount > 0;
          return (
            <p
              key={paragraph}
              className={`${enjoyDeviceToneClass(descriptionParagraphTones?.[index] ?? 'neutral', lightTone)}${
                synced ? ` guide-line-mark rounded px-1 ${frame === 0 ? 'guide-line-mark-first' : ''}` : ''
              }`}
              style={
                synced
                  ? {
                      animationDuration: `${duration}s`,
                      animationDelay: `${frame * GUIDE_ENJOY_FRAME_SEC}s`,
                    }
                  : undefined
              }
            >
              {paragraph}
            </p>
          );
        })}
      </div>
    );
  }

  return <p className={`mt-2 text-sm ${textClass}`}>{description}</p>;
}

function SelectionMethodPatternImage({
  image,
  sizes,
}: {
  image: GuideEnjoyIllustration;
  sizes: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white">
      <Image
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        className="h-auto w-full"
        sizes={sizes}
      />
      {image.blinkSrc ? (
        <Image
          src={image.blinkSrc}
          alt=""
          width={image.width}
          height={image.height}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain animate-guide-highlight-blink"
          sizes={sizes}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

function SelectionMethodPatterns({
  patterns,
  lightTone,
}: {
  patterns: readonly GuideEnjoySelectionPattern[];
  lightTone: boolean;
}) {
  return (
    <div className="w-full min-w-0 space-y-8 px-4 pb-5">
      {patterns.map((pattern) => (
        <section key={pattern.id} className="min-w-0" aria-label={`${pattern.label} ${pattern.title}`}>
          <div className="mb-3 flex items-start gap-2">
            <span
              className={`mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded px-1.5 text-xs font-bold ${enjoyDeviceBadgeClass(pattern.tone)}`}
            >
              {pattern.label}
            </span>
            <p className={`text-sm font-medium leading-relaxed ${enjoyDeviceToneClass(pattern.tone, lightTone)}`}>
              {pattern.title}
            </p>
          </div>
          <div
            className={
              pattern.tone === 'mobile' && pattern.images.length >= 2
                ? 'grid w-full grid-cols-2 items-start gap-3 sm:gap-5'
                : 'space-y-4'
            }
          >
            {pattern.images.map((image, index) => {
              const showStepNumber = pattern.images.length >= 2;
              return (
              <figure key={image.src} className="min-w-0">
                {image.caption || showStepNumber ? (
                  <figcaption
                    className={`mb-2 flex items-start gap-2 text-sm font-medium leading-snug ${enjoyDeviceToneClass(
                      image.captionTone ?? pattern.tone,
                      lightTone,
                    )}`}
                  >
                    {showStepNumber ? (
                      <span
                        className={`mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded px-1.5 text-xs font-bold tabular-nums ${enjoyDeviceBadgeClass(pattern.tone)}`}
                      >
                        {index + 1}
                      </span>
                    ) : null}
                    {image.caption ? <span className="pt-0.5">{image.caption}</span> : null}
                  </figcaption>
                ) : null}
                <SelectionMethodPatternImage
                  image={image}
                  sizes={
                    pattern.tone === 'mobile'
                      ? '(max-width: 640px) 45vw, 280px'
                      : '(max-width: 768px) 100vw, 720px'
                  }
                />
              </figure>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function SelectionMethodImageSequence({
  images,
}: {
  images: readonly GuideEnjoyIllustration[];
}) {
  const first = images[0];
  if (!first) return null;
  const frameSec = GUIDE_ENJOY_FRAME_SEC;
  const duration = images.length * frameSec;

  return (
    <div className="w-full min-w-0 px-4 pb-5">
      <div
        className="relative mx-auto w-full overflow-hidden rounded-lg border border-gray-200 bg-white"
        style={{
          aspectRatio: `${first.width} / ${first.height}`,
          maxWidth: first.width,
        }}
      >
        {images.map((image, index) => (
          <Image
            key={image.src}
            src={image.src}
            alt={index === 0 ? image.alt : ''}
            width={image.width}
            height={image.height}
            className="guide-frame-seq absolute inset-0 h-full w-full object-contain"
            style={{
              animationDuration: `${duration}s`,
              animationDelay: `${index * frameSec}s`,
            }}
            sizes="(max-width: 640px) 100vw, 1000px"
            aria-hidden={index === 0 ? undefined : true}
          />
        ))}
      </div>
    </div>
  );
}

function SelectionMethodImages({
  images,
  lightTone,
  animate = false,
}: {
  images: readonly GuideEnjoyIllustration[];
  lightTone: boolean;
  animate?: boolean;
}) {
  if (animate && images.length > 1) {
    return <SelectionMethodImageSequence images={images} />;
  }
  const isPair = images.length === 2;
  const pairTotalWidth = images.reduce((sum, image) => sum + image.width, 0);

  return (
    <div className="w-full min-w-0 px-4 pb-5">
      <div
        className={
          isPair
            ? 'grid w-full items-end gap-x-12 gap-y-4 sm:gap-x-16'
            : 'flex w-full justify-center'
        }
        style={
          isPair
            ? {
                gridTemplateColumns: images
                  .map((image) => `minmax(0, ${image.width}fr)`)
                  .join(' '),
              }
            : undefined
        }
      >
        {images.map((image) => {
          const pairDisplayWidth = Math.round((image.width / pairTotalWidth) * 720);
          return (
          <figure
            key={image.src}
            className={`flex min-w-0 flex-col items-center ${isPair ? 'w-full' : 'max-w-full'}`}
          >
            {image.caption ? (
              <figcaption
                className={`mb-1.5 text-center text-xs font-medium ${enjoyDeviceToneClass(
                  image.captionTone ?? 'neutral',
                  lightTone,
                )}`}
              >
                {image.caption}
              </figcaption>
            ) : null}
            <Image
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              className="h-auto w-full"
              style={
                isPair
                  ? { width: '100%', height: 'auto' }
                  : { width: `min(100%, ${image.width}px)`, height: 'auto' }
              }
              sizes={
                isPair
                  ? `(max-width: 640px) 65vw, ${pairDisplayWidth}px`
                  : `(max-width: 640px) 100vw, ${image.width}px`
              }
            />
          </figure>
          );
        })}
      </div>
    </div>
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
        <p className={`text-sm text-gray-400 ${showHeading ? 'mt-1' : 'mt-0.5'}`}>{category.lead}</p>
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
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {GUIDE_ENJOY_INTRO.subtitle}
        </p>
        <h1 className="text-2xl font-bold text-white">{GUIDE_ENJOY_INTRO.title}</h1>
        <p className="text-gray-400">{GUIDE_ENJOY_INTRO.lead}</p>
        <ul className="flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-stretch sm:overflow-x-auto">
          {GUIDE_ENJOY_USAGE_HIGHLIGHTS.map((pattern) => {
            const imageDisplayWidth = Math.round(pattern.imageWidth * 0.9);
            const isLightCard = pattern.cardTone === 'light';
            const cardWidth = pattern.imageWidth + 24;

            return (
            <li
              key={pattern.title}
              className={`flex w-full flex-col rounded-xl border sm:w-[var(--enjoy-highlight-card-w)] sm:shrink-0 ${
                isLightCard
                  ? 'border-gray-200 bg-white'
                  : 'border-gray-700 bg-gray-900/60'
              }`}
              style={{ '--enjoy-highlight-card-w': `${cardWidth}px` } as CSSProperties}
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
                  className="h-auto w-full max-w-full sm:max-w-none sm:shrink-0"
                  style={{
                    width: '100%',
                    maxWidth: `${imageDisplayWidth}px`,
                    height: 'auto',
                  }}
                  sizes={`(max-width: 639px) 100vw, ${imageDisplayWidth}px`}
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
          <p className="mt-1 text-sm text-gray-400">{GUIDE_ENJOY_SONG_SELECTION.lead}</p>
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
            <div className="flex flex-col">
              <div className="min-w-0 p-4">
                {activeSelectionMethod.preludeSteps?.length ? (
                  <div className="mb-4 border-b border-gray-200 pb-4">
                    <SelectionMethodPrelude
                      steps={activeSelectionMethod.preludeSteps}
                      lightTone={activeSelectionMethod.cardTone === 'light'}
                    />
                  </div>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3
                    className={`break-keep font-semibold ${
                      activeSelectionMethod.cardTone === 'light' ? 'text-gray-900' : 'text-white'
                    }`}
                  >
                    {activeSelectionMethod.preludeSteps?.length ? (
                      <span
                        className={`mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 align-middle text-xs font-bold tabular-nums ${
                          activeSelectionMethod.cardTone === 'light'
                            ? 'bg-red-700 text-white'
                            : 'bg-red-500 text-white'
                        }`}
                      >
                        {activeSelectionMethod.preludeSteps[activeSelectionMethod.preludeSteps.length - 1]
                          .step + 1}
                      </span>
                    ) : null}
                    {activeSelectionMethod.title}
                  </h3>
                  {activeSelectionMethod.badge ? (
                    <FeatureBadge badge={activeSelectionMethod.badge} />
                  ) : null}
                </div>
                <SelectionMethodDescription
                  description={activeSelectionMethod.description}
                  descriptionParagraphs={activeSelectionMethod.descriptionParagraphs}
                  descriptionParagraphTones={activeSelectionMethod.descriptionParagraphTones}
                  descriptionParagraphFrames={
                    activeSelectionMethod.animateImages
                      ? activeSelectionMethod.descriptionParagraphFrames
                      : undefined
                  }
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
              {activeSelectionMethod.patterns?.length ? (
                <SelectionMethodPatterns
                  patterns={activeSelectionMethod.patterns}
                  lightTone={activeSelectionMethod.cardTone === 'light'}
                />
              ) : null}
              {activeSelectionMethod.images?.length ? (
                <SelectionMethodImages
                  images={activeSelectionMethod.images}
                  lightTone={activeSelectionMethod.cardTone === 'light'}
                  animate={activeSelectionMethod.animateImages}
                />
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
          <p className="mt-1 text-sm text-gray-400">タブを切り替えて、機能をカテゴリごとに確認できます。</p>
        </div>

        <section className="space-y-4" aria-labelledby="enjoy-original-ais-heading">
          <div>
            <h3 id="enjoy-original-ais-heading" className="text-sm font-semibold text-white">
              {GUIDE_ENJOY_ORIGINAL_AIS.title}
            </h3>
            <p className="mt-1 text-sm text-gray-400">{GUIDE_ENJOY_ORIGINAL_AIS.lead}</p>
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
              href={guideInternalHref('/sitemap', linkSearchParams)}
              className="text-sky-400 underline-offset-2 hover:underline"
            >
              サイトマップ
            </Link>
          </li>
          <li>
            <Link
              href={guideInternalHref('/services', linkSearchParams)}
              className="text-sky-400 underline-offset-2 hover:underline"
            >
              サービス一覧
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
