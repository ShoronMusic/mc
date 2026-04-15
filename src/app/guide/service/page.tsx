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
        <h2 className="text-base font-semibold text-white">会の主催（ログイン時）</h2>
        <p className="text-gray-400">
          同時に主催できる会は、1アカウントあたり最大<strong className="text-gray-300">2部屋</strong>
          までです。3部屋目を始めるには、いずれかの会を終了してください。
        </p>
        <p className="text-gray-400">
          使い分けの一例として、<strong className="text-gray-300">1部屋は個人専用</strong>
          （自分の試聴・整理など）、
          <strong className="text-gray-300">もう1部屋は招待できるオープンな部屋</strong>
          （知り合いを呼ぶ会）と役割を分けると整理しやすく、運営としてもおすすめです（この分け方は任意です）。
        </p>
        <p className="text-gray-400">
          <strong className="text-gray-300">会が終了するタイミング</strong>
          について、参加ユーザーが誰もいなくなっただけでは会は自動では終了しません。トップの主催者メニューから
          <strong className="text-gray-300">「この部屋の開催を終了」</strong>
          を押して終了するか、システムによる自動終了を待ちます。自動終了は、誰かが一度でもその部屋に接続（在室としてカウント）したあと、在室がゼロの状態が一定時間（
          <strong className="text-gray-300">現状の目安は約30分</strong>
          ）続いた場合に行われます。開始から誰も接続しなかった会は、自動終了の対象外です。上記の時間や条件は、運用・技術の都合により変更されることがあります。
        </p>
        <h3 className="pt-1 text-sm font-semibold text-white">時間の目安（自動処理の一覧）</h3>
        <p className="text-gray-400">
          読み取りやすさのため表にまとめています。聞き専の利用も想定して、
          <strong className="text-gray-300">個人の無操作だけで退室させるかどうか</strong>
          は運営側でも要検討のため、現状の挙動を「現状」欄に明記しています。
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/80">
                <th scope="col" className="px-3 py-2 font-semibold text-gray-200">
                  対象
                </th>
                <th scope="col" className="px-3 py-2 font-semibold text-gray-200">
                  条件（概要）
                </th>
                <th scope="col" className="px-3 py-2 font-semibold text-gray-200">
                  目安の時間
                </th>
                <th scope="col" className="px-3 py-2 font-semibold text-gray-200">
                  システムのアクション
                </th>
              </tr>
            </thead>
            <tbody className="text-gray-400">
              <tr className="border-b border-gray-800 align-top">
                <td className="px-3 py-2 text-gray-300">会（部屋の開催）</td>
                <td className="px-3 py-2">誰かが一度でも在室になったあと、在室がゼロが続く</td>
                <td className="px-3 py-2 whitespace-nowrap">約30分</td>
                <td className="px-3 py-2">会を自動終了（主催の「開催を終了」と同様の結果）</td>
              </tr>
              <tr className="border-b border-gray-800 align-top">
                <td className="px-3 py-2 text-gray-300">参加者個人</td>
                <td className="px-3 py-2">
                  接続（在室）はあるが、発言・選曲などアプリ上のアクションが長時間ない（聞き専・タブ放置・端末のスリープ前なども含む）
                </td>
                <td className="px-3 py-2">（未定）</td>
                <td className="px-3 py-2">
                  <strong className="font-medium text-gray-300">現状</strong>
                  、無操作だけを理由とした強制退室・警告は行いません。在室表示は接続ベースです。無反応時に通知する・退室させる・表示を変える等は、今後の仕様として検討の余地があります。
                </td>
              </tr>
              <tr className="align-top">
                <td className="px-3 py-2 text-gray-300">選曲（1本の動画）</td>
                <td className="px-3 py-2">
                  YouTube のタイトルや説明が、配信サービスの宣伝文のように極端に長い・特定の販促語句を含むなど、曲名として信頼しにくいと自動判定されたとき（視聴履歴で主催が正しい曲名を保存している場合は除く）
                </td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">
                  AI による<strong className="text-gray-300">曲解説パック・従来の曲解説・無言時の豆知識</strong>
                  の生成を行わず、チャットにもその内容は出しません（システムメッセージも出しません）。判定は完璧ではなく、見落としや過剰反応がある場合があります。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">
          「在室」は接続の集計に基づくもので、画面を見ているか・反応があるかまでは判別しません。表の数値・条件は変更されることがあります。
        </p>
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
        <p className="text-gray-300">musicaichat0@gmail.com</p>
      </section>
    </article>
  );
}
