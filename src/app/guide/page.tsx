import type { Metadata } from 'next';
import Link from 'next/link';
import { YouTubeDataApiQuotaCallout } from '@/components/guide/YouTubeDataApiQuotaCallout';
import { GUIDE_SECTIONS } from '@/lib/guide-nav';
import { withPolicyModalQuery } from '@/lib/policy-modal-link';

export const metadata: Metadata = {
  title: 'ご利用上の注意（目次） | 洋楽AIチャット',
  description: 'チャット・AI・楽曲コメントなど、参加時の注意事項の目次です。',
};

type GuideIndexPageProps = {
  searchParams?: { modal?: string | string[] };
};

export default function GuideIndexPage({ searchParams }: GuideIndexPageProps) {
  const sections = GUIDE_SECTIONS.filter((s) => s.slug);
  const isModal =
    (Array.isArray(searchParams?.modal) ? searchParams?.modal[0] : searchParams?.modal) === '1';

  return (
    <article className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">ご利用上の注意</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">
          洋楽AIチャットを快適に使っていただくためのマナーと注意事項です。内容はトピックごとに分けています。利用条件の要約は{' '}
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
        <p className="mt-2 text-sm text-gray-300">洋楽AIチャット事務局</p>
        <p className="text-sm text-gray-300">mail@musicai.jp</p>
      </section>
    </article>
  );
}
