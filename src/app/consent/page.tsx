import type { Metadata } from 'next';
import { GuideFullNotice } from '@/components/guide/GuideFullNotice';
import { TermsConsentBlock } from '@/components/auth/TermsConsentBlock';
import { StartPageSiteIntro } from '@/components/home/StartPageSiteIntro';
import {
  getProductDisplayName,
  getProductDisplayNamePlain,
  IS_MC_PRODUCT,
} from '@/lib/product-branding';
import { safeInternalPath } from '@/lib/safe-next-path';

export const metadata: Metadata = {
  title: `ご利用にあたって | ${getProductDisplayName()}`,
  description: IS_MC_PRODUCT
    ? 'Music Chat（ミュージックチャット）のご利用前にご確認いただく注意事項です。'
    : '洋楽AIチャットのご利用前にご確認いただく注意事項です。',
};

export default function ConsentPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const nextPath = safeInternalPath(searchParams?.next);
  const shell = IS_MC_PRODUCT
    ? 'flex min-h-screen flex-col items-center bg-gray-100 p-4 pt-8 pb-8'
    : 'flex min-h-screen flex-col items-center bg-gray-950 p-4 pt-8 pb-8';
  const card = IS_MC_PRODUCT
    ? 'flex h-[min(100vh-2rem,56rem)] w-full max-w-lg flex-col rounded-xl border border-gray-200 bg-white shadow-lg'
    : 'flex h-[min(100vh-2rem,56rem)] w-full max-w-lg flex-col rounded-xl border border-gray-700 bg-gray-900 shadow-lg';
  const headerBorder = IS_MC_PRODUCT ? 'border-gray-200' : 'border-gray-700';
  const titleClass = IS_MC_PRODUCT
    ? 'text-center text-xl font-bold text-gray-900'
    : 'text-center text-xl font-bold text-white';
  const subClass = IS_MC_PRODUCT
    ? 'mt-1 text-center text-xs text-gray-500'
    : 'mt-1 text-center text-xs text-gray-500';
  const bodyBorder = IS_MC_PRODUCT ? 'border-gray-200' : 'border-gray-800';

  return (
    <div className={shell}>
      <div className={card}>
        <header className={`shrink-0 border-b ${headerBorder} px-5 py-4`}>
          <h1 className={titleClass}>{getProductDisplayNamePlain()}（β版）</h1>
          <p className={subClass}>ご利用にあたって</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className={`mb-6 border-b ${bodyBorder} pb-6`}>
            <StartPageSiteIntro forceShow liveChatsAfterHero />
          </div>
          <GuideFullNotice />
        </div>
        <TermsConsentBlock nextPath={nextPath} />
      </div>
    </div>
  );
}
