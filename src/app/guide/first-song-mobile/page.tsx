import type { Metadata } from 'next';
import { FirstSongMobileGuideArticle } from '@/components/guide/FirstSongMobileGuideArticle';
import { getSafeInternalReturnPath } from '@/lib/safe-return-path';

export const metadata: Metadata = {
  title: '選曲のしかた（スマホ） | ご利用上の注意',
  description: 'スマートフォンから YouTube の曲を選んで MusicAi で再生する手順です。',
};

function guideIndexHref(returnToRaw: string | string[] | undefined): string {
  const raw = Array.isArray(returnToRaw) ? returnToRaw[0] : returnToRaw;
  const safe = getSafeInternalReturnPath(raw);
  if (!safe) return '/guide';
  return `/guide?returnTo=${encodeURIComponent(safe.slice(1))}`;
}

function desktopFirstSongHref(returnToRaw: string | string[] | undefined): string {
  const raw = Array.isArray(returnToRaw) ? returnToRaw[0] : returnToRaw;
  const safe = getSafeInternalReturnPath(raw);
  if (!safe) return '/guide/first-song';
  return `/guide/first-song?returnTo=${encodeURIComponent(safe.slice(1))}`;
}

type PageProps = {
  searchParams?: { returnTo?: string | string[] };
};

export default function GuideFirstSongMobilePage({ searchParams }: PageProps) {
  const rt = searchParams?.returnTo;

  return (
    <FirstSongMobileGuideArticle
      variant="page"
      guideIndexHref={guideIndexHref(rt)}
      desktopGuideHref={desktopFirstSongHref(rt)}
    />
  );
}
