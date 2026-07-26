import type { Metadata } from 'next';
import Link from 'next/link';
import { guideInternalHref } from '@/lib/policy-modal-link';

export const metadata: Metadata = {
  title: 'よくある質問 | ご利用上の注意',
  description:
    '無料と有料の違い、YouTubeとの関係、運営者、洋楽テーマなど、洋楽AIチャットについてよくある質問です。',
};

type GuideFaqPageProps = {
  searchParams?: {
    modal?: string | string[];
    returnTo?: string | string[];
  };
};

export default function GuideFaqPage({ searchParams }: GuideFaqPageProps) {
  const linkClass = 'text-amber-400/90 underline-offset-2 hover:underline';

  return (
    <article className="space-y-8 text-sm leading-relaxed text-gray-300">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-white">よくある質問</h1>
        <p className="text-gray-400">
          公開・告知でよく聞かれる点をまとめています。料金の詳細は{' '}
          <Link href={guideInternalHref('/guide/ai-pricing', searchParams)} className={linkClass}>
            AI利用料金・クレジット
          </Link>
          、販売事業者情報は{' '}
          <Link
            href={guideInternalHref('/commercial-transactions', searchParams)}
            className={linkClass}
          >
            特定商取引法に基づく表示
          </Link>
          をご覧ください。
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">
          Q1. 何が無料で、何が有料ですか？
        </h2>
        <p className="text-gray-400">
          音楽の同時視聴（YouTube）、部屋での選曲、通常のチャットは
          <strong className="text-gray-300">無料</strong>
          です。有料なのは、クラウドAIを使う機能（曲のAI解説、@
          での質問など）です。登録後のお試し枠があり、枠を使い切ったあとも、AIなしの選曲・チャットは無料のまま使えます。料金の詳細は{' '}
          <Link href={guideInternalHref('/guide/ai-pricing', searchParams)} className={linkClass}>
            AI利用料金・クレジット
          </Link>
          をご覧ください。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">
          Q2. YouTube の音楽で稼いでいるのですか？音源の違法配信では？
        </h2>
        <p className="text-gray-400">
          いいえ。曲の再生は YouTube の
          <strong className="text-gray-300">公式な埋め込みプレイヤー</strong>
          を利用しています。当サービスが音源ファイルを独自に配信したり、音声だけを抜き出したりするものではありません。有料でお支払いいただくのは、AIによる解説・対話などの機能です。動画・音声の利用は
          YouTube 等の各サービスの規約に従います。違法アップロードの助長になる行為は禁止しています（
          <Link href={guideInternalHref('/guide/music', searchParams)} className={linkClass}>
            曲・コメント
          </Link>
          ）。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">
          Q3. 運営は誰ですか？怪しくないですか？
        </h2>
        <p className="text-gray-400">
          洋楽AIチャットは
          <strong className="text-gray-300">個人事業</strong>
          として運営しています。販売事業者・所在地・連絡先などは{' '}
          <Link
            href={guideInternalHref('/commercial-transactions', searchParams)}
            className={linkClass}
          >
            特定商取引法に基づく表示
          </Link>
          に記載しています。お問い合わせは同ページのメールアドレスまでお願いします。本サービスは
          Google / YouTube 等の公式サービスではありません。独立して運営しているコミュニティ型の音楽チャットです。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">
          Q4. なぜ洋楽だけなのですか？邦楽はダメなのですか？
        </h2>
        <p className="text-gray-400">
          邦楽を否定しているわけではありません。YouTube
          での掲載率や曲情報の取りやすさ、AI
          で言語の壁を越えた解説が届けやすいこと、懐かしさや世代とジャンルを超えた交流の場をつくりたいことなどから、いまは洋楽に特化した
          AI 解説・会話の場として設計しています。邦楽の曲解説も、周辺環境を整えたうえで順次公開していく方針です。詳しい理由と運営の思いは{' '}
          <Link href={guideInternalHref('/guide/about', searchParams)} className={linkClass}>
            このサービスについて
          </Link>
          をご覧ください。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">
          Q5. AIの解説は正しいですか？
        </h2>
        <p className="text-gray-400">
          AIの回答や解説には誤りが含まれることがあります。重要な事実は、公式サイトや信頼できる情報源でご確認ください。チャート順位や「バズった」等の断定は、根拠がない場合は控える方針で改善を続けています。詳しい注意は{' '}
          <Link href={guideInternalHref('/guide/ai', searchParams)} className={linkClass}>
            AI について
          </Link>
          もご覧ください。
        </p>
      </section>
    </article>
  );
}
