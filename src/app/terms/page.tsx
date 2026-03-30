import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ServiceDisclaimerIntro,
  ServiceDisclaimerList,
} from '@/components/legal/ServiceDisclaimer';
import { ServicePricingNotice } from '@/components/legal/ServicePricingNotice';

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
  // オープンリダイレクト防止: ローカルパスのみ許可（このアプリのルームは "/01" 形式）
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
        <p className="mt-2 text-gray-500">
          最終更新目安：掲載日時点。詳しいマナー・AI・楽曲・安全については{' '}
          <Link href="/guide" className="text-amber-400 underline-offset-2 hover:underline">
            ご利用上の注意
          </Link>
          、個人情報の取扱いは{' '}
          <Link href="/privacy" className="text-amber-400 underline-offset-2 hover:underline">
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
              を運営は保証しません。YouTube 等の第三者サービスは各提供者の規約に従います。詳細は{' '}
              <Link href="/guide/ai" className="text-amber-400 underline-offset-2 hover:underline">
                AI について
              </Link>
              ／
              <Link href="/guide/music" className="text-amber-400 underline-offset-2 hover:underline">
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
