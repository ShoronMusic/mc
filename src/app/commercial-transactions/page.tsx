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
  COMMERCIAL_TRANSACTIONS_OPERATOR,
  formatCommercialTransactionsSellerDisplay,
  formatCommercialTransactionsRepresentativeDisplay,
  isCommercialTransactionsContactPublished,
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
  const contactPublished = isCommercialTransactionsContactPublished();

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
          本ページは、洋楽AIチャット（本サービス）において販売する有料の AI 利用クレジット等に関する表示です。
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
            {contactPublished ? op.address : COMMERCIAL_TRANSACTIONS_CONTACT_UNPUBLISHED_NOTICE}
          </InfoRow>
          <InfoRow label="電話番号">
            {contactPublished ? (
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
          <InfoRow label="メールアドレス">{op.email}</InfoRow>
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
              1 クレジットは、AI 付き選曲（曲解説の基本 1 本）または @ による AI 質問 1 回の消費に相当します（サービス仕様により変更される場合があります）。
            </p>
          </InfoRow>
          <InfoRow label="商品代金以外の必要料金">
            インターネット接続料金、通信料、クレジットカード会社所定の手数料等は、お客様のご負担となります。
          </InfoRow>
          <InfoRow label="支払方法">
            クレジットカード決済（決済代行：Stripe）。Visa、Mastercard、American Express、JCB 等（利用可能なブランドは決済画面に表示されます）。
          </InfoRow>
          <InfoRow label="支払時期">
            購入手続き完了時に、お客様が選択したクレジットカードへ即時請求されます（前払い）。利用開始後の追加請求はありません。
          </InfoRow>
          <InfoRow label="課金の方式">
            {AI_CREDITS_PREPAID_NO_POST_BILLING_TOKUSHOHO}
          </InfoRow>
          <InfoRow label="商品の引渡時期">
            決済完了後、直ちにご利用中のアカウントへ AI 利用クレジットを反映します。
          </InfoRow>
          <InfoRow label="返品・交換・キャンセル">
            <p>
              本商品はデジタルコンテンツ（アカウント内の利用権）であり、決済完了後のお客様都合による返品・返金・キャンセルはお受けできません。
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
          最終更新：掲載日時点。販売価格・決済方式・商品内容は、予告なく変更される場合があります。変更後の購入については、変更後の表示が適用されます。
        </p>
      </main>
    </div>
  );
}
