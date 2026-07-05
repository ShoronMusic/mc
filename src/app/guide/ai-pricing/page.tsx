import type { Metadata } from 'next';
import Link from 'next/link';
import { AiCreditsPricingGuide } from '@/components/legal/AiCreditsPricingGuide';
import { guideInternalHref } from '@/lib/policy-modal-link';

export const metadata: Metadata = {
  title: 'AI利用料金・クレジット | ご利用上の注意',
  description:
    'AIクレジットで利用できる機能（曲解説・@質問等）、お試し枠、購入価格、前払いについての案内です。',
};

type GuideAiPricingPageProps = {
  searchParams?: {
    modal?: string | string[];
    returnTo?: string | string[];
  };
};

export default function GuideAiPricingPage({ searchParams }: GuideAiPricingPageProps) {
  const isModal =
    (Array.isArray(searchParams?.modal) ? searchParams?.modal[0] : searchParams?.modal) === '1';

  return (
    <article className="space-y-6 text-sm leading-relaxed text-gray-300">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-white">AI利用料金・クレジット</h1>
        <p className="text-gray-400">
          洋楽AIチャットは、<strong className="text-gray-300">無料の音楽チャット</strong>
          （YouTube 同時視聴）と、
          <strong className="text-gray-300">有料の AI 機能</strong>
          に分かれています。AI まわりの料金だけをこのページにまとめています。
        </p>
        <p className="text-xs text-gray-500">
          AI の注意事項（回答の性質・マナー等）は{' '}
          <Link
            href={guideInternalHref('/guide/ai', searchParams)}
            className="text-amber-400/90 underline-offset-2 hover:underline"
          >
            AI について
          </Link>
          、サービス全体の案内は{' '}
          <Link
            href={guideInternalHref('/guide/service', searchParams)}
            className="text-amber-400/90 underline-offset-2 hover:underline"
          >
            サービス全般
          </Link>
          をご覧ください。
        </p>
      </header>

      <AiCreditsPricingGuide showTitle={false} policyModal={isModal} />
    </article>
  );
}
