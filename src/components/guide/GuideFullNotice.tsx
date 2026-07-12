'use client';

import Link from 'next/link';
import { YouTubeDataApiQuotaCallout } from '@/components/guide/YouTubeDataApiQuotaCallout';
import {
  ServiceDisclaimerIntro,
  ServiceDisclaimerList,
} from '@/components/legal/ServiceDisclaimer';
import { AiCreditsPricingGuide } from '@/components/legal/AiCreditsPricingGuide';
import { ServicePricingNotice } from '@/components/legal/ServicePricingNotice';
import { IS_MC_PRODUCT } from '@/lib/product-branding';

/**
 * 初回同意画面用：ご利用上の注意を1ページにまとめた表示（/guide の各ページと同一内容）
 * mc では AI 料金・@ 質問など AI 関連を出さない。
 */
export function GuideFullNotice() {
  const textMuted = IS_MC_PRODUCT ? 'text-gray-600' : 'text-gray-400';
  const textBody = IS_MC_PRODUCT ? 'text-gray-700' : 'text-gray-300';
  const heading = IS_MC_PRODUCT ? 'text-gray-900' : 'text-white';
  const border = IS_MC_PRODUCT ? 'border-gray-200' : 'border-gray-800';
  const link = IS_MC_PRODUCT
    ? 'text-emerald-700 underline-offset-2 hover:underline'
    : 'text-amber-400 underline-offset-2 hover:underline';
  const code = IS_MC_PRODUCT
    ? 'rounded bg-gray-100 px-1 py-0.5 text-gray-800'
    : 'rounded bg-gray-800 px-1 py-0.5 text-gray-200';
  const strong = IS_MC_PRODUCT ? 'text-gray-800' : 'text-gray-300';

  return (
    <div className={`space-y-8 text-sm leading-relaxed ${textBody}`}>
      <p className={textMuted}>
        以下をお読みいただき、内容に同意のうえご利用ください。利用条件の要約は{' '}
        <Link href="/terms" className={link}>
          利用規約
        </Link>
        、マナーの分割表示は{' '}
        <Link href="/guide" className={link}>
          ご利用上の注意
        </Link>
        、個人情報・Cookie・利用状況分析は{' '}
        <Link href="/privacy" className={link}>
          プライバシーポリシー
        </Link>
        からご確認いただけます。
      </p>

      <article className={`space-y-5 border-b ${border} pb-6`}>
        <h2 className={`text-lg font-bold ${heading}`}>チャットのマナー</h2>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>相手と部屋への敬意</h3>
          <ul className={`list-disc space-y-1 pl-5 ${textMuted}`}>
            <li>誹謗中傷・差別・煽り・荒らしは行わないでください。</li>
            <li>相手の趣味や好みを否定する発言は避け、建設的な会話を心がけてください。</li>
          </ul>
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>スパム・宣伝・連投</h3>
          <ul className={`list-disc space-y-1 pl-5 ${textMuted}`}>
            <li>同じ内容の連投や、無関係な宣伝・外部誘導はご遠慮ください。</li>
            <li>リンクを貼る場合は、相手や部屋の文脈に合うものにしてください。</li>
          </ul>
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>トピック</h3>
          <p className={textMuted}>
            {IS_MC_PRODUCT
              ? '本サービスは音楽（邦楽・洋楽）を一緒に楽しむ場です。部屋の雰囲気に大きく反する話題は控えめにするか、別の場を検討してください。'
              : '本サービスは洋楽を楽しむ場です。部屋の雰囲気に大きく反する話題は控えめにするか、別の場を検討してください。'}
          </p>
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>トラブル時</h3>
          <p className={textMuted}>
            不適切な利用を見かけた場合は、運営が用意している通報・お問い合わせ手段があればご利用ください（運用に応じて整備されます）。
          </p>
        </section>
      </article>

      {!IS_MC_PRODUCT ? (
        <article className={`space-y-5 border-b ${border} pb-6`}>
          <h2 className={`text-lg font-bold ${heading}`}>AI について</h2>
          <section className="space-y-2">
            <h3 className={`font-semibold ${heading}`}>利用料金（AI）</h3>
            <AiCreditsPricingGuide showTitle={false} />
          </section>
          <section className="space-y-2">
            <h3 className={`font-semibold ${heading}`}>回答の性質</h3>
            <p className={textMuted}>
              AI の返答は参考用です。事実誤認・古い情報・文脈の取り違えが含まれることがあります。重要な判断は必ずご自身で確認してください。
            </p>
            <p className={textMuted}>
              AI に質問したい場合は、発言の先頭に <code className={code}>@</code> を付けてください
              （例: <code className={code}>@ おすすめの洋楽を1つ教えて</code>）。
            </p>
            <p className={textMuted}>
              AI への質問は音楽（洋楽）関連を前提にしています。音楽以外の質問や会話は控えてください。
            </p>
          </section>
          <section className="space-y-2">
            <h3 className={`font-semibold ${heading}`}>AI への質問（@）と違反時の対応</h3>
            <p className={textMuted}>
              次の自動チェックは、<strong className={strong}>発言の先頭が「@」で始まるAI宛ての質問のみ</strong>が対象です。通常のチャット（@なし）の不適切な発言については、チャットオーナーによる強制退出などで対応します。
            </p>
            <p className={textMuted}>
              音楽（洋楽）に関係なさそうだとシステムが判断した場合、チャット内に控えめな案内が表示されることがあります。イエローカードや強制退場は行いません。
            </p>
            <ul className={`list-disc space-y-1 pl-5 ${textMuted}`}>
              <li>案内は自動判定のため、意図と異なることがあります。メッセージ下の「異議」からお知らせいただけると助かります。繰り返し問題になる場合は、チャットオーナーや運営の案内に従ってください。</li>
            </ul>
          </section>
          <section className="space-y-2">
            <h3 className={`font-semibold ${heading}`}>楽曲・著作権まわり</h3>
            <p className={textMuted}>
              アーティスト名・曲名・歌詞・解説などについても、AI の説明は正確である保証はありません。公式情報や権利者の表記を優先してください。
            </p>
          </section>
          <section className="space-y-2">
            <h3 className={`font-semibold ${heading}`}>入力内容とプライバシー</h3>
            <ul className={`list-disc space-y-1 pl-5 ${textMuted}`}>
              <li>パスワード、住所、電話番号など、機微な個人情報を AI に送らないでください。</li>
              <li>サービスの仕様上、会話がログや学習に使われる可能性がある場合は、別途ポリシーで示されます。</li>
            </ul>
          </section>
          <section className="space-y-2">
            <h3 className={`font-semibold ${heading}`}>生成文の利用</h3>
            <p className={textMuted}>
              AI の出力をそのまま他サイトに転載したり商用利用したりする場合は、利用規約・著作権・出典の扱いにご注意ください。
            </p>
          </section>
        </article>
      ) : null}

      <article className={`space-y-5 border-b ${border} pb-6`}>
        <h2 className={`text-lg font-bold ${heading}`}>曲・コメント</h2>
        <YouTubeDataApiQuotaCallout />
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>再生と著作権</h3>
          <p className={textMuted}>
            動画・音声の再生は YouTube 等の配信元の利用規約に従います。違法アップロードの助長になる行為は行わないでください。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>画面のアーティスト・楽曲情報について</h3>
          <p className={textMuted}>
            タブ等に表示されるアーティスト・楽曲の説明・経歴・リリース情報等は、外部の参照データを自動照合した結果である場合があります。
            正確性・真偽・最新性、および再生中の楽曲との対応を運営は保証しません。公式情報を優先してください。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>アーティスト・作品への言及</h3>
          <ul className={`list-disc space-y-1 pl-5 ${textMuted}`}>
            <li>アーティストや他のリスナーへの中傷、過度な罵倒は避けてください。</li>
            <li>好みの違いは「好き嫌い」として尊重し、押し付けや論争の火種にならない表現を心がけてください。</li>
          </ul>
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>歌詞・引用</h3>
          <p className={textMuted}>
            歌詞の長文引用は著作権上の問題になることがあります。必要最小限にとどめるか、公式の歌詞ページへの誘導を検討してください。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>コメントのトーン</h3>
          <p className={textMuted}>
            批評やネタも歓迎ですが、場が和やかに続くよう、ユーモアと敬意のバランスを意識してください。
          </p>
        </section>
      </article>

      <article className={`space-y-5 border-b ${border} pb-6`}>
        <h2 className={`text-lg font-bold ${heading}`}>アカウントと安全</h2>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>参加方法</h3>
          <p className={textMuted}>
            入室後、ゲスト・簡易登録・Google 認証などから参加方法を選べます。方式によって表示名の扱いや再入室時の挙動が異なる場合があります。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>個人情報</h3>
          <ul className={`list-disc space-y-1 pl-5 ${textMuted}`}>
            <li>本名・住所・電話番号・勤務先など、特定につながる情報はチャットに書かないでください。</li>
            <li>他者になりすます行為は禁止です。</li>
          </ul>
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>部屋の指定</h3>
          <p className={textMuted}>
            トップには、開催中で参加者がいる部屋へのリンクが表示されることがあります。表示がない場合や、部屋を直接指定したい場合は、サイトのアドレスの後ろに{' '}
            <code className={code}>/01</code> や{' '}
            <code className={code}>/05</code> のように部屋 ID を付けて開けます。知らないリンクからの入室には注意してください。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>主催と部屋の使い分け（ログイン時）</h3>
          <p className={textMuted}>
            ログインして会を主催する場合、同時に開催中にできるのは最大<strong className={strong}>2部屋</strong>
            までです。
          </p>
          <p className={textMuted}>
            開催中の部屋では、チャットオーナーがマイページの<strong className={strong}>部屋設定（オーナー）</strong>から<strong className={strong}>「鍵を掛ける」</strong>で新規参加を締め切れます（既に参加済みのユーザーは再入室できます）。
          </p>
          <p className={textMuted}>
            補足として、<strong className={strong}>1部屋を個人専用</strong>（試聴・整理など）、
            <strong className={strong}>もう1部屋を招待できるオープンルーム</strong>
            に分けると運用しやすい、というおすすめの一例です（必須ではありません）。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>外部とのやり取り</h3>
          <p className={textMuted}>
            チャット内で知り合った相手と個人的に連絡を取る場合は、詐欺・なりすましに十分注意し、無理な個人情報の開示はしないでください。
          </p>
        </section>
      </article>

      <article className="space-y-5">
        <h2 className={`text-lg font-bold ${heading}`}>サービス全般</h2>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>会の主催（ログイン時）</h3>
          <p className={textMuted}>
            同時に主催できる会は、1アカウントあたり最大2部屋までです。3部屋目を始めるには、いずれかの会を終了してください。
          </p>
          <p className={textMuted}>
            使い分けの一例として、1部屋を個人専用、もう1部屋を招待できるオープンな部屋とすると整理しやすく、おすすめです（任意です）。
          </p>
          <p className={textMuted}>
            <span className={`font-semibold ${strong}`}>会が終了するタイミング：</span>
            参加ユーザーが誰もいなくなっただけでは会は自動では終了しません。トップの主催者メニューから「この部屋の開催を終了」を押すか、システムによる自動終了を待ちます。自動終了は、誰かが一度でもその部屋に接続（在室）したあと、在室がゼロの状態が一定時間（現状の目安は約30分）続いた場合に行われます。開始から誰も接続しなかった会は対象外です。時間や条件は変更されることがあります。
          </p>
          <p className={textMuted}>
            <span className={`font-semibold ${strong}`}>時間の目安（表）</span>：会の自動終了と、参加者個人の「無反応」と在室表示の関係は、
            <Link href="/guide/service" className={link}>
              サービス全般
            </Link>
            の「時間の目安（自動処理の一覧）」を参照してください。個人の無操作だけでの強制退室は
            <strong className={strong}>現状ありません</strong>（聞き専利用も想定し、今後の扱いは検討中です）。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>利用料金</h3>
          <ServicePricingNotice />
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>サービス内容の変更</h3>
          <p className={textMuted}>
            機能追加・仕様変更・メンテナンスによる一時停止など、事前予告なく変更される場合があります。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>免責・責任の範囲</h3>
          <ServiceDisclaimerIntro />
          <ServiceDisclaimerList />
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>違反への対応</h3>
          <p className={textMuted}>
            マナー違反や法令違反が認められる場合、メッセージの削除・アカウントや端末の利用制限など、運営の判断で措置を取ることがあります。
          </p>
        </section>
        <section className="space-y-2">
          <h3 className={`font-semibold ${heading}`}>お問い合わせ・フィードバック</h3>
          <p className={textMuted}>
            不具合やご意見は、アプリ内のフィードバックや運営が案内する連絡先があればそちらへお願いします（整備状況により記載を追加してください）。
          </p>
        </section>
      </article>
    </div>
  );
}
