import Link from 'next/link';
import {
  ServiceDisclaimerIntro,
  ServiceDisclaimerList,
} from '@/components/legal/ServiceDisclaimer';
import { ServicePricingNotice } from '@/components/legal/ServicePricingNotice';

/**
 * 初回同意画面用：ご利用上の注意を1ページにまとめた表示（/guide の各ページと同一内容）
 */
export function GuideFullNotice() {
  return (
    <div className="space-y-8 text-sm leading-relaxed text-gray-300">
      <p className="text-gray-400">
        以下をお読みいただき、内容に同意のうえご利用ください。利用条件の要約は{' '}
        <Link href="/terms" className="text-amber-400 underline-offset-2 hover:underline">
          利用規約
        </Link>
        、マナーの分割表示は{' '}
        <Link href="/guide" className="text-amber-400 underline-offset-2 hover:underline">
          ご利用上の注意
        </Link>
        からご確認いただけます。
      </p>

      <article className="space-y-5 border-b border-gray-800 pb-6">
        <h2 className="text-lg font-bold text-white">チャットのマナー</h2>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">相手とルームへの敬意</h3>
          <ul className="list-disc space-y-1 pl-5 text-gray-400">
            <li>誹謗中傷・差別・煽り・荒らしは行わないでください。</li>
            <li>相手の趣味や好みを否定する発言は避け、建設的な会話を心がけてください。</li>
          </ul>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">スパム・宣伝・連投</h3>
          <ul className="list-disc space-y-1 pl-5 text-gray-400">
            <li>同じ内容の連投や、無関係な宣伝・外部誘導はご遠慮ください。</li>
            <li>リンクを貼る場合は、相手やルームの文脈に合うものにしてください。</li>
          </ul>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">トピック</h3>
          <p className="text-gray-400">
            本サービスは洋楽を楽しむ場です。ルームの雰囲気に大きく反する話題は控えめにするか、別の場を検討してください。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">トラブル時</h3>
          <p className="text-gray-400">
            不適切な利用を見かけた場合は、運営が用意している通報・お問い合わせ手段があればご利用ください（運用に応じて整備されます）。
          </p>
        </section>
      </article>

      <article className="space-y-5 border-b border-gray-800 pb-6">
        <h2 className="text-lg font-bold text-white">AI について</h2>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">回答の性質</h3>
          <p className="text-gray-400">
            AI の返答は参考用です。事実誤認・古い情報・文脈の取り違えが含まれることがあります。重要な判断は必ずご自身で確認してください。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">楽曲・著作権まわり</h3>
          <p className="text-gray-400">
            アーティスト名・曲名・歌詞・解説などについても、AI の説明は正確である保証はありません。公式情報や権利者の表記を優先してください。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">入力内容とプライバシー</h3>
          <ul className="list-disc space-y-1 pl-5 text-gray-400">
            <li>パスワード、住所、電話番号など、機微な個人情報を AI に送らないでください。</li>
            <li>サービスの仕様上、会話がログや学習に使われる可能性がある場合は、別途ポリシーで示されます。</li>
          </ul>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">生成文の利用</h3>
          <p className="text-gray-400">
            AI の出力をそのまま他サイトに転載したり商用利用したりする場合は、利用規約・著作権・出典の扱いにご注意ください。
          </p>
        </section>
      </article>

      <article className="space-y-5 border-b border-gray-800 pb-6">
        <h2 className="text-lg font-bold text-white">曲・コメント</h2>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">再生と著作権</h3>
          <p className="text-gray-400">
            動画・音声の再生は YouTube 等の配信元の利用規約に従います。違法アップロードの助長になる行為は行わないでください。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">画面のアーティスト・楽曲情報について</h3>
          <p className="text-gray-400">
            タブ等に表示されるアーティスト・楽曲の説明・経歴・リリース情報等は、外部の参照データを自動照合した結果である場合があります。
            正確性・真偽・最新性、および再生中の楽曲との対応を運営は保証しません。公式情報を優先してください。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">アーティスト・作品への言及</h3>
          <ul className="list-disc space-y-1 pl-5 text-gray-400">
            <li>アーティストや他のリスナーへの中傷、過度な罵倒は避けてください。</li>
            <li>好みの違いは「好き嫌い」として尊重し、押し付けや論争の火種にならない表現を心がけてください。</li>
          </ul>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">歌詞・引用</h3>
          <p className="text-gray-400">
            歌詞の長文引用は著作権上の問題になることがあります。必要最小限にとどめるか、公式の歌詞ページへの誘導を検討してください。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">コメントのトーン</h3>
          <p className="text-gray-400">
            批評やネタも歓迎ですが、場が和やかに続くよう、ユーモアと敬意のバランスを意識してください。
          </p>
        </section>
      </article>

      <article className="space-y-5 border-b border-gray-800 pb-6">
        <h2 className="text-lg font-bold text-white">アカウントと安全</h2>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">参加方法</h3>
          <p className="text-gray-400">
            入室後、ゲスト・簡易登録・Google 認証などから参加方法を選べます。方式によって表示名の扱いや再入室時の挙動が異なる場合があります。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">個人情報</h3>
          <ul className="list-disc space-y-1 pl-5 text-gray-400">
            <li>本名・住所・電話番号・勤務先など、特定につながる情報はチャットに書かないでください。</li>
            <li>他者になりすます行為は禁止です。</li>
          </ul>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">ルームの指定</h3>
          <p className="text-gray-400">
            トップから 01〜03 に入るほか、URL で <code className="rounded bg-gray-800 px-1 py-0.5 text-gray-200">/04</code>、
            <code className="rounded bg-gray-800 px-1 py-0.5 text-gray-200">/05</code>{' '}
            のようにルーム番号を指定できます。知らないリンクからの入室には注意してください。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">外部とのやり取り</h3>
          <p className="text-gray-400">
            チャット内で知り合った相手と個人的に連絡を取る場合は、詐欺・なりすましに十分注意し、無理な個人情報の開示はしないでください。
          </p>
        </section>
      </article>

      <article className="space-y-5">
        <h2 className="text-lg font-bold text-white">サービス全般</h2>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">利用料金</h3>
          <ServicePricingNotice />
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">サービス内容の変更</h3>
          <p className="text-gray-400">
            機能追加・仕様変更・メンテナンスによる一時停止など、事前予告なく変更される場合があります。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">免責・責任の範囲</h3>
          <ServiceDisclaimerIntro />
          <ServiceDisclaimerList />
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">違反への対応</h3>
          <p className="text-gray-400">
            マナー違反や法令違反が認められる場合、メッセージの削除・アカウントや端末の利用制限など、運営の判断で措置を取ることがあります。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold text-white">お問い合わせ・フィードバック</h3>
          <p className="text-gray-400">
            不具合やご意見は、アプリ内のフィードバックや運営が案内する連絡先があればそちらへお願いします（整備状況により記載を追加してください）。
          </p>
        </section>
      </article>
    </div>
  );
}
