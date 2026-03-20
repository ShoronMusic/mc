import type { Metadata } from 'next';
import Link from 'next/link';
import { GUIDE_SECTIONS } from '@/lib/guide-nav';

export const metadata: Metadata = {
  title: 'ご利用上の注意（目次） | 洋楽AIチャット',
  description: 'チャット・AI・楽曲コメントなど、参加時の注意事項の目次です。',
};

export default function GuideIndexPage() {
  const sections = GUIDE_SECTIONS.filter((s) => s.slug);

  return (
    <article className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">ご利用上の注意</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">
          洋楽AIチャットを快適に使っていただくためのマナーと注意事項です。内容はトピックごとに分けています。利用条件の要約は{' '}
          <Link href="/terms" className="text-amber-400 underline-offset-2 hover:underline">
            利用規約
          </Link>
          をご覧ください。
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-1">
        {sections.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block rounded-xl border border-gray-700 bg-gray-900 p-4 transition hover:border-gray-500 hover:bg-gray-800"
            >
              <span className="font-semibold text-white">{s.title}</span>
              <span className="mt-1 block text-sm text-gray-400">{s.short}</span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
