import type { Metadata } from 'next';
import { GuideFullNotice } from '@/components/guide/GuideFullNotice';
import { TermsConsentBlock } from '@/components/auth/TermsConsentBlock';
import { StartPageSiteIntro } from '@/components/home/StartPageSiteIntro';
import { safeInternalPath } from '@/lib/safe-next-path';

export const metadata: Metadata = {
  title: 'ご利用にあたって | 洋楽AIチャット',
  description: '洋楽AIチャットのご利用前にご確認いただく注意事項です。',
};

export default function ConsentPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const nextPath = safeInternalPath(searchParams?.next);

  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-950 p-4 pt-8 pb-8">
      <div className="flex h-[min(100vh-2rem,56rem)] w-full max-w-lg flex-col rounded-xl border border-gray-700 bg-gray-900 shadow-lg">
        <header className="shrink-0 border-b border-gray-700 px-5 py-4">
          <h1 className="text-center text-xl font-bold text-white">洋楽AIチャット</h1>
          <p className="mt-1 text-center text-xs text-gray-500">ご利用にあたって</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-6 border-b border-gray-800 pb-6">
            <StartPageSiteIntro forceShow />
          </div>
          <GuideFullNotice />
        </div>
        <TermsConsentBlock nextPath={nextPath} />
      </div>
    </div>
  );
}
