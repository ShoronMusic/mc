import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ServiceDisclaimerIntro,
  ServiceDisclaimerList,
} from '@/components/legal/ServiceDisclaimer';
import { ServicePricingNotice } from '@/components/legal/ServicePricingNotice';
import { withPolicyModalQuery } from '@/lib/policy-modal-link';

export const metadata: Metadata = {
  title: '利用規約 | 洋楽AIチャット',
  description: '洋楽AIチャットの利用条件（要約）です。利用料金・マナー・AI・楽曲の詳細はご利用上の注意もご覧ください。',
};

type TermsPageProps = {
  searchParams?: {
    returnTo?: string | string[];
    modal?: string | string[];
  };
};

function resolveReturnToPath(returnToRaw: string | string[] | undefined): string | null {
  const value = Array.isArray(returnToRaw) ? returnToRaw[0] : returnToRaw;
  if (!value || typeof value !== 'string') return null;
  const decoded = value.trim();
  // オープンリダイレクト防止: ローカルパスのみ許可（このアプリの部屋は "/01" 形式）
  if (!decoded.startsWith('/')) return null;
  if (decoded.startsWith('//')) return null;
  if (decoded.includes('://')) return null;
  if (decoded === '/terms' || decoded === '/privacy' || decoded === '/guide') return null;
  return decoded;
}

/**
 * チャットサービス「チャベリ」（chaberi.com）の利用規約 PDF・ご利用のお約束の枠組みを参考に、
 * 当サービス向けに簡潔化・独自化。詳細マナーは /guide に集約し冗長化を避けています。
 */
export default function TermsPage({ searchParams }: TermsPageProps) {
  const returnTo = resolveReturnToPath(searchParams?.returnTo);
  const isModal = (Array.isArray(searchParams?.modal) ? searchParams?.modal[0] : searchParams?.modal) === '1';
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {!isModal ? (
        <header className="border-b border-gray-800 bg-gray-900/50">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-3">
              {returnTo ? (
                <Link href={returnTo} className="text-sm text-amber-300 transition hover:text-amber-200">
                  ← チャットへ戻る
                </Link>
              ) : null}
              <Link href="/" className="text-sm text-gray-400 transition hover:text-white">
                ← トップへ
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/privacy" className="text-sm text-gray-400 transition hover:text-white">
                プライバシー
              </Link>
              <Link href="/guide" className="text-sm text-gray-400 transition hover:text-white">
                ご利用上の注意 →
              </Link>
            </div>
          </div>
        </header>
      ) : null}

      <main className="mx-auto max-w-3xl px-4 py-8 text-sm leading-relaxed text-gray-300">
        <h1 className="text-2xl font-bold text-white">利用規約（要約）</h1>
        <p className="mt-1 text-xs text-gray-500">
          本ページの内容は、運営上の必要に応じて予告なく更新されることがあります。
          見出しの「要約」は読みやすさのための整理であり、条件の詳細は以下の各条および
          <Link
            href={withPolicyModalQuery('/guide', isModal)}
            className="text-amber-400/90 underline-offset-2 hover:underline"
          >
            ご利用上の注意
          </Link>
          にも含まれる場合があります。
        </p>
        <p className="mt-2 text-gray-500">
          最終更新目安：掲載日時点。詳しいマナー・AI・楽曲・安全については{' '}
          <Link
            href={withPolicyModalQuery('/guide', isModal)}
            className="text-amber-400 underline-offset-2 hover:underline"
          >
            ご利用上の注意
          </Link>
          、個人情報の取扱いは{' '}
          <Link
            href={withPolicyModalQuery('/privacy', isModal)}
            className="text-amber-400 underline-offset-2 hover:underline"
          >
            プライバシーポリシー
          </Link>
          をあわせてご確認ください。
        </p>

        <ol className="mt-8 list-decimal space-y-6 pl-5 marker:font-semibold marker:text-gray-500">
          <li>
            <span className="font-semibold text-white">適用</span>
            <p className="mt-1 text-gray-400">
              本規約は洋楽AIチャット（本サービス）の利用条件です。本サービスを利用した時点で、本規約に同意したものとみなします。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">目的</span>
            <p className="mt-1 text-gray-400">
              本サービスは、洋楽の視聴・会話および AI 機能を通じた交流を目的とします。相手は利用者も AI も含め、敬意と配慮あるコミュニケーションを求めます。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">利用料金</span>
            <div className="mt-1">
              <ServicePricingNotice />
            </div>
          </li>
          <li>
            <span className="font-semibold text-white">会の主催（ログイン時）</span>
            <p className="mt-1 text-gray-400">
              同時に主催（開催中の会を立てること）できる部屋は、1アカウントあたり最大2までです。超過する場合は、不要な会を終了してから新しく開始してください。
              参加者がいなくなっただけでは会は直ちに終了せず、主催者による終了操作のほか、在室がゼロの状態が一定時間続いた場合にシステムが自動で終了することがあります（目安・詳細はご利用上の注意の「サービス全般」を参照してください。時間や条件は変更されることがあります）。
              運用上の補足として、例えば
              <strong className="text-gray-300">1部屋を自分の試聴・整理など個人で使う専用の部屋</strong>、
              <strong className="text-gray-300">もう1部屋を友人などを招待するオープンな部屋</strong>
              と役割を分けるとわかりやすく、推奨される使い方の一例です（必須の運用ではありません）。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">禁止行為（代表例）</span>
            <p className="mt-1 text-gray-400">
              次に該当し、またはそのおそれがある行為を禁止します：チャット妨害・荒らし、特定者への嫌がらせやストーキング、出会い目的の募集、初対面に近い相手への一方的な連絡先の伝達・勧誘・強要、公序良俗に反する発言、誹謗中傷、著しく乱暴な言葉、無関係な広告・宣伝・スパム、法令違反、その他運営が不適切と判断する行為。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">通報・対応</span>
            <p className="mt-1 text-gray-400">
              禁止行為を見かけた場合は、運営が案内する通報・お問い合わせ手段があればご利用ください。確認のうえ、表示削除・利用制限等の措置を取ることがあります。相手への過剰な攻撃は、かえって迷惑と受け取られる場合があります。落ち着いた礼節ある対応と通報を優先してください。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">個人情報</span>
            <p className="mt-1 text-gray-400">
              氏名・住所・連絡先・所属などの公開はリスクを伴います。自己責任のうえ慎重に判断してください。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">年齢への配慮</span>
            <p className="mt-1 text-gray-400">
              未成年の利用者が同席する場合があります。内容・表現に配慮してください。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">AI・表示情報・外部サービス</span>
            <p className="mt-1 text-gray-400">
              AI の出力は参考情報であり、正確性・完全性を保証しません。本サービス内に表示されるアーティスト名・楽曲に関する説明・経歴・リリース情報等のうち、外部の参照データに基づくものについても、
              <strong className="text-gray-300">正確性・真偽・網羅性・最新性および再生中の動画・楽曲との対応関係</strong>
              を運営は保証しません。YouTube 等の第三者サービスは各提供者の規約に従います。              詳細は{' '}
              <Link
                href={withPolicyModalQuery('/guide/ai', isModal)}
                className="text-amber-400 underline-offset-2 hover:underline"
              >
                AI について
              </Link>
              ／
              <Link
                href={withPolicyModalQuery('/guide/music', isModal)}
                className="text-amber-400 underline-offset-2 hover:underline"
              >
                曲・コメント
              </Link>
              を参照してください。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">免責・責任の範囲</span>
            <div className="mt-2 space-y-3">
              <ServiceDisclaimerIntro />
              <ServiceDisclaimerList />
            </div>
          </li>
          <li>
            <span className="font-semibold text-white">サービス内容の変更・中断</span>
            <p className="mt-1 text-gray-400">
              機能追加・仕様変更・メンテナンス等により、本サービスを事前予告なく変更・中断・終了することがあります。これに起因する損害については、前項（免責・責任の範囲）に従います。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">規約の変更</span>
            <p className="mt-1 text-gray-400">
              運営は本規約を変更できます。変更後の利用により、変更に同意したものとみなします。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">準拠法</span>
            <p className="mt-1 text-gray-400">本規約は日本法に準拠して解釈されます。</p>
          </li>
        </ol>

        <section className="mt-10 rounded-lg border border-gray-800 bg-gray-900/40 p-4">
          <h2 className="text-sm font-semibold text-white">運営者</h2>
          <p className="mt-2 text-sm text-gray-300">洋楽AIチャット事務局</p>
          <p className="text-sm text-gray-300">mail@musicai.jp</p>
        </section>

      </main>
    </div>
  );
}
