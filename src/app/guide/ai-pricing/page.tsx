import type { Metadata } from 'next';
import Link from 'next/link';
import { AiCreditsPricingGuide } from '@/components/legal/AiCreditsPricingGuide';
import { guideInternalHref } from '@/lib/policy-modal-link';

export const metadata: Metadata = {
  title: 'AI利用料金・クレジット | ご利用上の注意',
  description:
    'ゲスト・無料登録（お試し）・クレジット購入の3区分で、利用できるサービスと料金を一覧で案内します。',
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
          参加のしかたは
          <strong className="text-gray-300">ゲスト</strong>、
          <strong className="text-gray-300">無料登録（初回クレジット付き）</strong>、
          <strong className="text-gray-300">無料登録（クレジット購入）</strong>
          の3区分です。下の表で、それぞれ何が使えるかを確認できます。
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
