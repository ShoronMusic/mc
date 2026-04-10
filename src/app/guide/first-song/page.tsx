import type { Metadata } from 'next';
import { FirstSongGuideArticle } from '@/components/guide/FirstSongGuideArticle';
import { FirstSongMobileGuideArticle } from '@/components/guide/FirstSongMobileGuideArticle';
import { getSafeInternalReturnPath } from '@/lib/safe-return-path';

export const metadata: Metadata = {
  title: '選曲のしかた | ご利用上の注意',
  description:
    'MusicAi チャットで YouTube の曲を流す手順です。スマートフォンでは YouTube アプリの共有からコピーする手順を表示します。',
};

function guideIndexHref(returnToRaw: string | string[] | undefined): string {
  const raw = Array.isArray(returnToRaw) ? returnToRaw[0] : returnToRaw;
  const safe = getSafeInternalReturnPath(raw);
  if (!safe) return '/guide';
  return `/guide?returnTo=${encodeURIComponent(safe.slice(1))}`;
}

function mobileFirstSongHref(returnToRaw: string | string[] | undefined): string {
  const raw = Array.isArray(returnToRaw) ? returnToRaw[0] : returnToRaw;
  const safe = getSafeInternalReturnPath(raw);
  if (!safe) return '/guide/first-song-mobile';
  return `/guide/first-song-mobile?returnTo=${encodeURIComponent(safe.slice(1))}`;
}

function desktopFirstSongHref(returnToRaw: string | string[] | undefined): string {
  const raw = Array.isArray(returnToRaw) ? returnToRaw[0] : returnToRaw;
  const safe = getSafeInternalReturnPath(raw);
  if (!safe) return '/guide/first-song';
  return `/guide/first-song?returnTo=${encodeURIComponent(safe.slice(1))}`;
}

type GuideFirstSongPageProps = {
  searchParams?: { returnTo?: string | string[] };
};

export default function GuideFirstSongPage({ searchParams }: GuideFirstSongPageProps) {
  const rt = searchParams?.returnTo;

  return (
    <>
      <div className="hidden lg:block">
        <FirstSongGuideArticle
          variant="page"
          guideIndexHref={guideIndexHref(rt)}
          mobileGuideHref={mobileFirstSongHref(rt)}
        />
      </div>
      <div className="lg:hidden">
        <FirstSongMobileGuideArticle
          variant="page"
          guideIndexHref={guideIndexHref(rt)}
          desktopGuideHref={desktopFirstSongHref(rt)}
        />
      </div>
    </>
  );
}
