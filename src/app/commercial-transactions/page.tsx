import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  AI_CREDIT_PACK_1000_CREDITS,
  AI_CREDIT_PACK_1000_JPY,
  AI_CREDIT_PACK_500_CREDITS,
  AI_CREDIT_PACK_500_JPY,
} from '@/lib/ai-credits-config';
import {
  COMMERCIAL_TRANSACTIONS_CONTACT_UNPUBLISHED_NOTICE,
  COMMERCIAL_TRANSACTIONS_LAST_UPDATED_LABEL,
  COMMERCIAL_TRANSACTIONS_OPERATOR,
  formatCommercialTransactionsSellerDisplay,
  formatCommercialTransactionsRepresentativeDisplay,
  isCommercialTransactionsAddressPublished,
  isCommercialTransactionsPhonePublished,
} from '@/lib/commercial-transactions-operator';
import { AI_CREDITS_PREPAID_NO_POST_BILLING_TOKUSHOHO } from '@/lib/ai-credits-prepaid-disclosure';
import { withPolicyModalQuery } from '@/lib/policy-modal-link';

export const metadata: Metadata = {
  title: '特定商取引法に基づく表示 | 洋楽AIチャット（β版）',
  description:
    '洋楽AIチャットにおける AI クレジット等の有料販売に関する、特定商取引法に基づく表示です。',
};

type CommercialTransactionsPageProps = {
  searchParams?: {
    modal?: string | string[];
  };
};

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-gray-800 py-4 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm font-semibold text-white">{label}</dt>
      <dd className="text-sm text-gray-400">{children}</dd>
    </div>
  );
}

export default function CommercialTransactionsPage({ searchParams }: CommercialTransactionsPageProps) {
  const isModal =
    (Array.isArray(searchParams?.modal) ? searchParams?.modal[0] : searchParams?.modal) === '1';
  const op = COMMERCIAL_TRANSACTIONS_OPERATOR;
  const addressPublished = isCommercialTransactionsAddressPublished();
  const phonePublished = isCommercialTransactionsPhonePublished();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {!isModal ? (
        <header className="border-b border-gray-800 bg-gray-900/50">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="text-sm text-gray-400 transition hover:text-white">
              ← トップへ
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/terms" className="text-sm text-gray-400 transition hover:text-white">
                利用規約
              </Link>
              <Link href="/privacy" className="text-sm text-gray-400 transition hover:text-white">
                プライバシー →
              </Link>
            </div>
          </div>
        </header>
      ) : null}

      <main className="mx-auto max-w-3xl px-4 py-8 text-sm leading-relaxed text-gray-300">
        <h1 className="text-2xl font-bold text-white">特定商取引法に基づく表示</h1>
        <p className="mt-2 text-gray-500">
          本表記は「洋楽AIチャット（本サービス）」に関する特定商取引法に基づく表示です。
        </p>
        <p className="mt-2 text-xs text-gray-500">最終更新日: {COMMERCIAL_TRANSACTIONS_LAST_UPDATED_LABEL}</p>
        <p className="mt-4 rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-3 text-sm text-amber-100/90">
          現在、本サービスはβ版として運営しており、
          <strong className="font-semibold text-amber-50">サイト上での有料クレジットの自動販売（Stripe 等）はまだ開始していません</strong>
          。下記の販売価格・お支払い方法等は、有料販売を正式に開始する際に適用する予定の条件です。開始時期は未定であり、変更・延期または中止する場合があります。開始する際は、サービス内またはサイト上で事前にご案内します。なお、運営によるクレジットの手動付与等がある場合は、その都度の案内に従います。
        </p>
        <p className="mt-4 text-gray-500">
          クレジットで利用できる機能の一覧は{' '}
          <Link
            href={withPolicyModalQuery('/guide/ai-pricing', isModal)}
            className="text-amber-400 underline-offset-2 hover:underline"
          >
            AI利用料金・クレジット
          </Link>
          をご覧ください。利用条件の詳細は{' '}
          <Link
            href={withPolicyModalQuery('/terms', isModal)}
            className="text-amber-400 underline-offset-2 hover:underline"
          >
            利用規約
          </Link>
          もあわせてご確認ください。
        </p>

        <dl className="mt-8">
          <InfoRow label="販売事業者">{formatCommercialTransactionsSellerDisplay()}</InfoRow>
          <InfoRow label="運営責任者">{formatCommercialTransactionsRepresentativeDisplay()}</InfoRow>
          <InfoRow label="所在地">
            {addressPublished ? op.address : COMMERCIAL_TRANSACTIONS_CONTACT_UNPUBLISHED_NOTICE}
          </InfoRow>
          <InfoRow label="電話番号">
            {phonePublished ? (
              <>
                {op.phone}
                <span className="mt-1 block text-xs text-gray-500">
                  お電話でのお問い合わせは、順次対応いたします。内容によりメールでのご連絡をお願いする場合があります。
                </span>
              </>
            ) : (
              COMMERCIAL_TRANSACTIONS_CONTACT_UNPUBLISHED_NOTICE
            )}
          </InfoRow>
          <InfoRow label="お問い合わせ先">
            {op.email}
            <span className="mt-1 block text-xs text-gray-500">
              まずはメールでのご連絡にご協力をお願いしております。
            </span>
          </InfoRow>
          <InfoRow label="販売価格">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                AI 利用クレジット {AI_CREDIT_PACK_500_CREDITS} 単位：{AI_CREDIT_PACK_500_JPY} 円（税込）
              </li>
              <li>
                AI 利用クレジット {AI_CREDIT_PACK_1000_CREDITS} 単位：{AI_CREDIT_PACK_1000_JPY} 円（税込）
              </li>
            </ul>
            <p className="mt-2 text-xs text-gray-500">
              1 クレジットは、AI 付き選曲（曲解説の基本 1 本）または @ による AI 質問 1 回の消費に相当します（サービス仕様により変更される場合があります）。有料販売の正式開始までは、上記価格での購入手続きはできません。
            </p>
          </InfoRow>
          <InfoRow label="商品代金以外の必要料金">
            インターネット接続料金、通信料、クレジットカード会社所定の手数料等は、お客様のご負担となります。
          </InfoRow>
          <InfoRow label="お支払い方法">
            クレジットカード決済（決済代行：Stripe）。Visa、Mastercard、American Express、JCB 等（利用可能なブランドは決済画面に表示されます）。有料販売の正式開始後に利用可能となります。
          </InfoRow>
          <InfoRow label="お支払い時期">
            購入手続き完了時に、お客様が選択したクレジットカードへ即時請求されます（前払い）。利用開始後の追加請求はありません。
          </InfoRow>
          <InfoRow label="課金の方式">{AI_CREDITS_PREPAID_NO_POST_BILLING_TOKUSHOHO}</InfoRow>
          <InfoRow label="自動更新について">
            本商品はプリペイド（都度購入）であり、月額・定期の自動更新・自動課金はありません。追加のクレジットが必要な場合は、お客様ご自身で再度ご購入ください。
          </InfoRow>
          <InfoRow label="解約について">
            プリペイドのデジタル利用権のため、月額契約のような解約手続きはありません。購入済みクレジットは残高がある間ご利用いただけます。サービスアカウントの削除・退会をご希望の場合は、お問い合わせ先までご連絡ください（残高の扱い・返金可否は「返品・返金について」に従います）。
          </InfoRow>
          <InfoRow label="サービスの提供時期">
            決済完了後、直ちにご利用中のアカウントへ AI 利用クレジットを反映します。
          </InfoRow>
          <InfoRow label="返品・返金について">
            <p>
              本商品はデジタルコンテンツ（アカウント内の利用権）であり、決済完了後のお客様都合による返品・返金・キャンセルはお受けできません。あらかじめご了承ください。
            </p>
            <p className="mt-2">
              ただし、法令に基づき返金等が必要となる場合、または運営の責に帰すべき事由によりクレジットが正常に付与されなかった場合は、この限りではありません。該当するとお考えのときは、上記連絡先までご連絡ください。
            </p>
            <p className="mt-2 text-xs text-gray-500">
              購入手続きにおいて、引渡しの完了後は返品等ができない旨に同意いただいたうえで決済を行います（特定商取引法に基づくクーリング・オフの適用除外に関する同意）。
            </p>
          </InfoRow>
          <InfoRow label="動作環境">
            本サービスが推奨する Web ブラウザおよびネットワーク環境。詳細は{' '}
            <Link
              href={withPolicyModalQuery('/guide', isModal)}
              className="text-amber-400 underline-offset-2 hover:underline"
            >
              ご利用上の注意
            </Link>
            を参照してください。
          </InfoRow>
        </dl>

        <p className="mt-8 text-xs text-gray-600">
          販売価格・決済方式・商品内容は、予告なく変更される場合があります。変更後の購入については、変更後の表示が適用されます。
        </p>
      </main>
    </div>
  );
}
