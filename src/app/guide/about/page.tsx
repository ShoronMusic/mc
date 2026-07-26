import type { Metadata } from 'next';
import { AboutServiceMessage } from '@/components/guide/AboutServiceMessage';
import { IS_MC_PRODUCT } from '@/lib/product-branding';

export const metadata: Metadata = {
  title: IS_MC_PRODUCT
    ? 'このサービスについて | Music Chat'
    : 'このサービスについて | ご利用上の注意',
  description: IS_MC_PRODUCT
    ? 'Music Chat が目指すことについての短い案内です。'
    : '洋楽AIチャットが目指すこと、なぜ洋楽をテーマにしているか、運営の思いとこれからについてです。',
};

type GuideAboutPageProps = {
  searchParams?: {
    modal?: string | string[];
    returnTo?: string | string[];
  };
};

export default function GuideAboutPage({ searchParams }: GuideAboutPageProps) {
  if (IS_MC_PRODUCT) {
    return (
      <article className="space-y-6 text-sm leading-relaxed text-gray-700">
        <h1 className="text-2xl font-bold text-gray-900">このサービスについて</h1>
        <p>
          Music Chat は、邦楽・洋楽どちらも選曲できる、YouTube
          同時視聴とチャットに特化した無料サービスです。AI
          による曲解説や洋楽特化の体験は、姉妹サイトの洋楽AIチャット側で提供しています。
        </p>
      </article>
    );
  }

  return (
    <article>
      <AboutServiceMessage searchParams={searchParams} />
    </article>
  );
}
