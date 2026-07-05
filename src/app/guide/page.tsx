import type { Metadata } from 'next';
import Link from 'next/link';
import { YouTubeDataApiQuotaCallout } from '@/components/guide/YouTubeDataApiQuotaCallout';
import { ServicePricingNoticeBrief } from '@/components/legal/ServicePricingNotice';
import { GUIDE_SECTIONS } from '@/lib/guide-nav';
import { withPolicyModalQuery } from '@/lib/policy-modal-link';
import { formatCommercialTransactionsOperatorFooter } from '@/lib/commercial-transactions-operator';

export const metadata: Metadata = {
  title: 'ご利用上の注意（目次） | 洋楽AIチャット（β版）',
  description: 'チャット・AI・楽曲コメントなど、参加時の注意事項の目次です。機能一覧はサイトマップページをご覧ください。',
};

type GuideIndexPageProps = {
  searchParams?: { modal?: string | string[] };
};

export default function GuideIndexPage({ searchParams }: GuideIndexPageProps) {
  const sections = GUIDE_SECTIONS.filter((s) => s.slug && s.slug !== 'enjoy');
  const isModal =
    (Array.isArray(searchParams?.modal) ? searchParams?.modal[0] : searchParams?.modal) === '1';

  return (
    <article className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">ご利用上の注意</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">
          洋楽AIチャットを快適に使っていただくためのマナーと注意事項です。内容はトピックごとに分けています。
          機能の紹介は{' '}
          <Link
            href={withPolicyModalQuery('/guide/enjoy', isModal)}
            className="text-sky-400 underline-offset-2 hover:underline"
          >
            楽しみ方
          </Link>
          をご覧ください。          機能の一覧（料金区分付き）は{' '}
          <Link
            href={withPolicyModalQuery('/services', isModal)}
            className="text-emerald-400 underline-offset-2 hover:underline"
          >
            サービス一覧
          </Link>
          、ページ全体の目次は{' '}
          <Link
            href={withPolicyModalQuery('/sitemap', isModal)}
            className="text-emerald-400 underline-offset-2 hover:underline"
          >
            サイトマップ
          </Link>
          、利用条件の要約は{' '}
          <Link
            href={withPolicyModalQuery('/terms', isModal)}
            className="text-amber-400 underline-offset-2 hover:underline"
          >
            利用規約
          </Link>
          をご覧ください。
        </p>
        <div className="mt-4">
          <YouTubeDataApiQuotaCallout />
        </div>
        <div className="mt-4 text-sm leading-relaxed">
          <ServicePricingNoticeBrief />
        </div>
      </div>
      <Link
        href={withPolicyModalQuery('/sitemap', isModal)}
        className="block rounded-xl border border-gray-700 bg-gray-900/50 p-4 transition hover:border-gray-600 hover:bg-gray-900"
      >
        <span className="font-semibold text-gray-100">サイトマップ</span>
        <span className="mt-1 block text-sm text-gray-400">
          ガイド・規約・サービス一覧・モーダル表示など、公開ページへのリンクをまとめています。
        </span>
      </Link>
      <Link
        href={withPolicyModalQuery('/services', isModal)}
        className="block rounded-xl border border-emerald-800/50 bg-emerald-950/25 p-4 transition hover:border-emerald-600/60 hover:bg-emerald-950/40"
      >
        <span className="font-semibold text-emerald-100">サービス一覧</span>
        <span className="mt-1 block text-sm text-gray-400">
          無料・クレジット・サイト負担など、機能を料金区分ごとに一覧で確認できます。
        </span>
      </Link>
      <Link
        href={withPolicyModalQuery('/guide/enjoy', isModal)}
        className="block rounded-xl border border-sky-800/60 bg-sky-950/30 p-4 transition hover:border-sky-600/70 hover:bg-sky-950/50"
      >
        <span className="font-semibold text-sky-100">洋楽AIチャットの楽しみ方</span>
        <span className="mt-1 block text-sm text-gray-400">
          基本機能・ライブラリ・AI・マイページなどを分類して紹介しています。はじめての方はこちらから。
        </span>
      </Link>
      <div>
        <h2 className="text-sm font-semibold text-gray-300">ご利用上の注意</h2>
      </div>
      <ul className="grid gap-3 sm:grid-cols-1">
        {sections.map((s) => (
          <li key={s.href}>
            <Link
              href={withPolicyModalQuery(s.href, isModal)}
              className="block rounded-xl border border-gray-700 bg-gray-900 p-4 transition hover:border-gray-500 hover:bg-gray-800"
            >
              <span className="font-semibold text-white">{s.title}</span>
              <span className="mt-1 block text-sm text-gray-400">{s.short}</span>
            </Link>
          </li>
        ))}
      </ul>
      <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
        <h2 className="text-sm font-semibold text-white">運営者</h2>
        <p className="mt-2 text-sm text-gray-300">{formatCommercialTransactionsOperatorFooter()}</p>
        <p className="text-sm text-gray-300">musicaichat0@gmail.com</p>
      </section>
    </article>
  );
}
