import type { Metadata } from 'next';
import {
  ServiceDisclaimerIntro,
  ServiceDisclaimerList,
} from '@/components/legal/ServiceDisclaimer';
import { ServicePricingNotice } from '@/components/legal/ServicePricingNotice';

export const metadata: Metadata = {
  title: 'サービス全般 | ご利用上の注意',
  description: '利用料金、免責、変更、お問い合わせなどに関する案内です。',
};

export default function GuideServicePage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-gray-300">
      <h1 className="text-2xl font-bold text-white">サービス全般</h1>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">利用料金</h2>
        <ServicePricingNotice />
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">サービス内容の変更</h2>
        <p className="text-gray-400">
          機能追加・仕様変更・メンテナンスによる一時停止など、事前予告なく変更される場合があります。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">免責・責任の範囲</h2>
        <ServiceDisclaimerIntro />
        <ServiceDisclaimerList />
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">違反への対応</h2>
        <p className="text-gray-400">
          マナー違反や法令違反が認められる場合、メッセージの削除・アカウントや端末の利用制限など、運営の判断で措置を取ることがあります。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">お問い合わせ・フィードバック</h2>
        <p className="text-gray-400">
          不具合やご意見は、アプリ内のフィードバックまたは下記連絡先までお願いします。
        </p>
      </section>
      <section className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/40 p-4">
        <h2 className="text-base font-semibold text-white">運営者・連絡先</h2>
        <p className="text-gray-300">洋楽AIチャット事務局</p>
        <p className="text-gray-300">mail@musicai.jp</p>
      </section>
    </article>
  );
}
