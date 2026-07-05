import type { Metadata } from 'next';
import Link from 'next/link';
import { withPolicyModalQuery } from '@/lib/policy-modal-link';
import { formatCommercialTransactionsOperatorFooter } from '@/lib/commercial-transactions-operator';

export const metadata: Metadata = {
  title: 'プライバシーポリシー | 洋楽AIチャット（β版）',
  description:
    '洋楽AIチャットにおける個人情報の取扱い（Cookie・利用状況分析・外部送信・お問い合わせ）を簡潔にまとめたページです。',
};

type PrivacyPageProps = {
  searchParams?: {
    modal?: string | string[];
  };
};

export default function PrivacyPage({ searchParams }: PrivacyPageProps) {
  const isModal = (Array.isArray(searchParams?.modal) ? searchParams?.modal[0] : searchParams?.modal) === '1';
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {!isModal ? (
        <header className="border-b border-gray-800 bg-gray-900/50">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="text-sm text-gray-400 transition hover:text-white">
              ← トップへ
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/commercial-transactions"
                className="text-sm text-gray-400 transition hover:text-white"
              >
                特商法表示
              </Link>
              <Link href="/terms" className="text-sm text-gray-400 transition hover:text-white">
                利用規約 →
              </Link>
            </div>
          </div>
        </header>
      ) : null}

      <main className="mx-auto max-w-3xl px-4 py-8 text-sm leading-relaxed text-gray-300">
        <h1 className="text-2xl font-bold text-white">プライバシーポリシー（簡潔版）</h1>
        <p className="mt-2 text-gray-500">
          制定日・改定日は、本ページの更新時点を基準に運用します。詳細な利用条件は{' '}
          <Link
            href={withPolicyModalQuery('/terms', isModal)}
            className="text-amber-400 underline-offset-2 hover:underline"
          >
            利用規約
          </Link>
          もあわせてご確認ください。
        </p>

        <ol className="mt-8 list-decimal space-y-6 pl-5 marker:font-semibold marker:text-gray-500">
          <li>
            <span className="font-semibold text-white">取得する情報</span>
            <p className="mt-1 text-gray-400">
              メールアドレス、表示名、認証に必要なアカウント情報、チャット投稿内容、アクセスログ（IP・ブラウザ情報・日時）、閲覧ページ URL・端末情報（利用状況分析ツール経由）等を取得することがあります。
            </p>
            <p className="mt-1 text-gray-400">
              Supabase Authentication を利用する範囲では、当サービス運営側がユーザーのパスワード平文を直接保存・閲覧することはありません。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">利用目的</span>
            <p className="mt-1 text-gray-400">
              サービス提供、ログイン管理、機能改善、利用状況分析、不正利用の防止、お問い合わせ対応のために利用します。
            </p>
            <p className="mt-1 text-gray-400">
              チャットの会話ログは、主に音楽データ・利用傾向の分析およびサービス改善のために利用し、法令に基づく場合を除き外部に提供しません。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">第三者提供</span>
            <p className="mt-1 text-gray-400">
              法令に基づく場合または本人同意がある場合を除き、個人情報を第三者へ提供しません。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">外部サービスの利用（外部送信）</span>
            <p className="mt-1 text-gray-400">
              本サービスでは、認証・DB・ホスティング・AI 生成・動画情報取得・利用状況分析などのため、Supabase、Vercel、Google（認証/Gemini/Google Analytics）、YouTube Data API、MusicBrainz、Ably 等を利用します。必要な範囲で端末情報やリクエスト情報が各提供元へ送信される場合があります。
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-400">
              <li>
                <strong className="text-gray-300">Google Analytics</strong>（Google LLC）：閲覧ページ URL、端末・ブラウザ情報、IP
                アドレス等を、利用状況の把握・サービス改善の目的で送信します。初回アクセスから Cookie
                等により記録されることがあります（詳細は下記「Cookie および端末内保存」）。
              </li>
            </ul>
          </li>
          <li>
            <span className="font-semibold text-white">安全管理</span>
            <p className="mt-1 text-gray-400">
              不正アクセス、漏えい、滅失、毀損の防止に向け、合理的な安全管理措置を講じます。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">開示・訂正・削除</span>
            <p className="mt-1 text-gray-400">
              保有情報の開示・訂正・削除の希望がある場合は、下記連絡先までご連絡ください。本人確認の上、合理的な範囲で対応します。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">Cookie および端末内保存</span>
            <p className="mt-1 text-gray-400">
              本サービスでは、次の目的で Cookie およびブラウザの localStorage / sessionStorage
              を利用します。分析用 Cookie は、別途の Cookie 同意バナーがなくても、
              <strong className="text-gray-300">サイト初回アクセス時から</strong>
              送信されることがあります（本ポリシーへの同意・部屋入室前の規約同意とは別枠です）。
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-400">
              <li>
                <strong className="text-gray-300">認証・セッション</strong>（Cookie）：ログイン状態の維持（Supabase
                Authentication）。
              </li>
              <li>
                <strong className="text-gray-300">認証処理の補助</strong>（Cookie）：OAuth ログイン後の戻り先保持（短期・数分程度）。
              </li>
              <li>
                <strong className="text-gray-300">利用状況分析</strong>（Cookie）：Google Analytics
                によるアクセス数・閲覧傾向の計測（初回アクセスから。分析 ID
                が設定されている場合に限ります）。
              </li>
              <li>
                <strong className="text-gray-300">機能・設定の保存</strong>（localStorage /
                sessionStorage）：規約同意の記録、ゲスト再入室、表示設定、部屋参加に必要な端末内 ID
                等。主にサービス提供のためであり、第三者への広告配信目的では利用しません。
              </li>
            </ul>
            <p className="mt-2 text-gray-400">
              Cookie や端末内保存をブラウザ設定等で無効化・削除した場合、ログイン、再入室、一部の表示設定などが利用できなくなることがあります。Google
              Analytics のオプトアウトについては、Google が提供するブラウザアドオン等もご利用いただけます。
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">ポリシー変更</span>
            <p className="mt-1 text-gray-400">
              法令改正やサービス変更に応じて、本ポリシーを改定することがあります。改定後は本ページ掲載時点で効力を生じます。
            </p>
          </li>
        </ol>

        <section className="mt-10 rounded-lg border border-gray-800 bg-gray-900/40 p-4">
          <h2 className="text-sm font-semibold text-white">運営者・お問い合わせ</h2>
          <p className="mt-2 text-sm text-gray-300">{formatCommercialTransactionsOperatorFooter()}</p>
          <p className="text-sm text-gray-300">musicaichat0@gmail.com</p>
        </section>
      </main>
    </div>
  );
}

