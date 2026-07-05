import Link from 'next/link';
import {
  AI_CREDITS_BILLABLE_ITEMS,
  AI_CREDITS_FREE_FEATURES,
  AI_CREDITS_PACK_ROWS,
  AI_CREDITS_PRICING_PAGE_PATH,
  AI_CREDITS_PRICING_PAGE_TITLE,
  AI_CREDITS_SITE_BORNE_ITEMS,
  AI_CREDITS_TRIAL_ROWS,
} from '@/lib/ai-credits-pricing-guide';
import { AI_CREDITS_PREPAID_NO_POST_BILLING_BRIEF } from '@/lib/ai-credits-prepaid-disclosure';
import { withPolicyModalQuery } from '@/lib/policy-modal-link';

type AiCreditsPricingGuideProps = {
  showTitle?: boolean;
  policyModal?: boolean;
};

function policyHref(path: string, policyModal: boolean): string {
  return withPolicyModalQuery(path, policyModal);
}

export function AiCreditsPricingGuide({
  showTitle = true,
  policyModal = false,
}: AiCreditsPricingGuideProps) {
  return (
    <div className="space-y-5 text-sm leading-relaxed text-gray-400">
      {showTitle ? (
        <h2 className="text-lg font-bold text-white">{AI_CREDITS_PRICING_PAGE_TITLE}</h2>
      ) : null}

      <section className="space-y-2">
        <h3 className="font-semibold text-white">無料で使えること</h3>
        <ul className="list-disc space-y-1 pl-5">
          {AI_CREDITS_FREE_FEATURES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-white">AIクレジットが必要なこと</h3>
        <p className="text-xs text-gray-500">
          お試し枠または購入クレジットから消費します。1 クレジット＝下表の 1 単位です。
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/80">
                <th className="px-3 py-2 font-semibold text-gray-200">機能</th>
                <th className="px-3 py-2 font-semibold text-gray-200">消費</th>
                <th className="px-3 py-2 font-semibold text-gray-200">含まれる主な内容</th>
              </tr>
            </thead>
            <tbody>
              {AI_CREDITS_BILLABLE_ITEMS.map((item) => (
                <tr key={item.label} className="border-b border-gray-800 align-top">
                  <td className="px-3 py-2.5 text-gray-300">{item.label}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-300">
                    {item.credits} クレジット / {item.unit}
                  </td>
                  <td className="px-3 py-2.5">
                    <ul className="list-disc space-y-0.5 pl-4">
                      {item.includes.map((inc) => (
                        <li key={inc}>{inc}</li>
                      ))}
                    </ul>
                    {item.note ? <p className="mt-1.5 text-xs text-gray-500">{item.note}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-white">サイト側負担（クレジット消費なし）</h3>
        <p className="text-xs text-gray-500">
          次の AI 機能は、参加者のクレジット・お試し枠を使いません。API 原価はサイト運営側が負担します。
        </p>
        <ul className="space-y-2">
          {AI_CREDITS_SITE_BORNE_ITEMS.map((item) => (
            <li
              key={item.label}
              className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-3 py-2.5"
            >
              <p className="font-medium text-emerald-100/90">{item.label}</p>
              <p className="mt-1 text-sm text-gray-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-white">お試し枠（無料登録）</h3>
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="w-full min-w-[360px] border-collapse text-left text-sm">
            <tbody>
              {AI_CREDITS_TRIAL_ROWS.map((row) => (
                <tr key={row.audience} className="border-b border-gray-800 last:border-0">
                  <th className="w-32 px-3 py-2.5 font-semibold text-gray-300">{row.audience}</th>
                  <td className="px-3 py-2.5">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-white">クレジット購入（税込・前払い）</h3>
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="w-full min-w-[280px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/80">
                <th className="px-3 py-2 font-semibold text-gray-200">価格</th>
                <th className="px-3 py-2 font-semibold text-gray-200">付与</th>
              </tr>
            </thead>
            <tbody>
              {AI_CREDITS_PACK_ROWS.map((pack) => (
                <tr key={pack.yen} className="border-b border-gray-800 last:border-0">
                  <td className="px-3 py-2.5 text-gray-300">{pack.yen} 円</td>
                  <td className="px-3 py-2.5 text-gray-300">{pack.credits} クレジット</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">{AI_CREDITS_PREPAID_NO_POST_BILLING_BRIEF}</p>
      </section>

      <p className="text-xs text-gray-500">
        仕様・価格・お試し枠は変更される場合があります。購入条件は{' '}
        <Link
          href={policyHref('/commercial-transactions', policyModal)}
          className="text-amber-400/90 underline-offset-2 hover:underline"
        >
          特定商取引法に基づく表示
        </Link>
        をご確認ください。
      </p>
    </div>
  );
}

export function AiCreditsPricingGuideLink({
  policyModal = false,
  className = 'text-amber-400/90 underline-offset-2 hover:underline',
}: {
  policyModal?: boolean;
  className?: string;
}) {
  return (
    <Link href={policyHref(AI_CREDITS_PRICING_PAGE_PATH, policyModal)} className={className}>
      {AI_CREDITS_PRICING_PAGE_TITLE}
    </Link>
  );
}
