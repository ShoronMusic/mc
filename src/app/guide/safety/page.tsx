import type { Metadata } from 'next';
import Link from 'next/link';
import { guideInternalHref } from '@/lib/policy-modal-link';

export const metadata: Metadata = {
  title: 'アカウントと安全 | ご利用上の注意',
  description: 'ゲスト・登録・個人情報など、安全に使うための注意です。',
};

type GuideSafetyPageProps = {
  searchParams?: { modal?: string | string[]; returnTo?: string | string[] };
};

export default function GuideSafetyPage({ searchParams }: GuideSafetyPageProps) {
  const serviceHref = guideInternalHref('/guide/service', searchParams);
  return (
    <article className="space-y-6 text-sm leading-relaxed text-gray-300">
      <h1 className="text-2xl font-bold text-white">アカウントと安全</h1>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">参加方法</h2>
        <p className="text-gray-400">
          入室後、ゲスト・簡易登録・Google 認証などから参加方法を選べます。方式によって表示名の扱いや再入室時の挙動が異なる場合があります。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">個人情報</h2>
        <ul className="list-disc space-y-2 pl-5 text-gray-400">
          <li>本名・住所・電話番号・勤務先など、特定につながる情報はチャットに書かないでください。</li>
          <li>他者になりすます行為は禁止です。</li>
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">部屋の指定</h2>
        <p className="text-gray-400">
          トップには、開催中で参加者がいる部屋へのリンクが表示されることがあります。表示がない場合や、部屋を直接指定したい場合は、サイトのアドレスの後ろに{' '}
          <code className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-200">/01</code> や{' '}
          <code className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-200">/05</code> のように部屋 ID を付けて開けます。知らないリンクからの入室には注意してください。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">主催と部屋の使い分け（ログイン時）</h2>
        <p className="text-gray-400">
          ログインして会を主催する場合、<strong className="text-gray-300">同時に開催中にできるのは最大2部屋</strong>
          までです。
        </p>
        <p className="text-gray-400">
          補足として、<strong className="text-gray-300">1部屋を個人専用</strong>（試聴・整理など）、
          <strong className="text-gray-300">もう1部屋を招待できるオープンルーム</strong>
          に分けると運用しやすい、というおすすめの一例です（必須ではありません）。詳しくは
          <Link href={serviceHref} className="text-amber-400 underline-offset-2 hover:underline">
            サービス全般
          </Link>
          も参照してください。
        </p>
        <p className="text-gray-400">
          会がいつ終了するか（全員が退室してもすぐには終わらないこと、在室ゼロが続いた場合の自動終了の目安など）は、
          <Link href={serviceHref} className="text-amber-400 underline-offset-2 hover:underline">
            サービス全般
          </Link>
          の「会の主催（ログイン時）」を参照してください。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">外部とのやり取り</h2>
        <p className="text-gray-400">
          チャット内で知り合った相手と個人的に連絡を取る場合は、詐欺・なりすましに十分注意し、無理な個人情報の開示はしないでください。
        </p>
      </section>
    </article>
  );
}
