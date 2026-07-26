import Link from 'next/link';
import { guideInternalHref } from '@/lib/policy-modal-link';

type AboutServiceMessageProps = {
  searchParams?: {
    modal?: string | string[];
    returnTo?: string | string[];
  };
  /** FAQ などから呼ぶとき見出しを出さない */
  showTitle?: boolean;
};

const linkClass = 'text-amber-400/90 underline-offset-2 hover:underline';

/**
 * 洋楽AIチャットのサイトメッセージ（なぜ洋楽か・運営の思い・これから）。
 * FAQ 要約の正本は docs/sns-launch-criticism-prep.md と同期する。
 */
export function AboutServiceMessage({
  searchParams,
  showTitle = true,
}: AboutServiceMessageProps) {
  return (
    <div className="space-y-8 text-sm leading-relaxed text-gray-300">
      {showTitle ? (
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-white">このサービスについて</h1>
          <p className="text-gray-400">
            洋楽AIチャットが目指すこと、なぜ洋楽をテーマにしているか、運営の思いとこれからについてです。
          </p>
        </header>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">目指していること</h2>
        <p className="text-gray-400">
          YouTube
          の曲をみんなで同じタイミングで聴きながらチャットし、AI
          の解説や質問を通じて洋楽への距離を縮める場をつくることです。新旧のリスナーが交わり、世代とジャンルを超えた化学反応が生まれることを期待しています。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">なぜ洋楽をテーマにしているか</h2>
        <p className="text-gray-400">
          邦楽を否定しているわけではありません。いまの段階では、次のような理由から
          <strong className="text-gray-300">洋楽に特化した AI 解説・会話</strong>
          の場として設計しています。
        </p>
        <ul className="list-disc space-y-2 pl-5 text-gray-400">
          <li>
            <strong className="text-gray-300">YouTube での掲載率</strong>
            — 邦楽に比べ、公式・高品質な動画が見つかりやすく、同時視聴の土台が揃いやすいためです。
          </li>
          <li>
            <strong className="text-gray-300">タイトルなどの記載が定型的</strong>
            — 洋楽は「アーティスト − 曲名」形式などメタデータが比較的そろっており、正しい曲情報を取りやすいためです。
          </li>
          <li>
            <strong className="text-gray-300">AI と言語の壁</strong>
            — AI の普及により、英語圏の文脈も踏まえた曲解説を日本語で届けやすくなりました。解説があることで、洋楽への心理的な距離が近くなる効果も期待しています。
          </li>
          <li>
            <strong className="text-gray-300">いま一度盛り上げたい</strong>
            — 1990年代から2000年代をひとつの頂点に、相対的に邦楽に押され気味だった洋楽を、もう一度楽しく語れる場にしたいという思いがあります。
          </li>
          <li>
            <strong className="text-gray-300">懐かしさと共有</strong>
            — かつて洋楽に熱狂したファンが集まり、当時の楽しさや懐かしさを共有するサロンにしたいと考えています。
          </li>
          <li>
            <strong className="text-gray-300">世代とジャンルを超えた交流</strong>
            — 昔からのファンと、いま洋楽に出会う新しいファンが交わる化学反応を大切にしたいです。
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">運営の思い</h2>
        <p className="text-gray-400">
          主催者はいち洋楽ファンであり、既存のチャットサービスで洋楽視聴をテーマにした会を主催してきた経験があります。その経験を活かし、選曲の進行や AI
          解説など、より機能的で楽しめる音楽チャットをつくりたいと考えてこのサービスを始めました。個人事業として運営しており、販売事業者などの表示は{' '}
          <Link
            href={guideInternalHref('/commercial-transactions', searchParams)}
            className={linkClass}
          >
            特定商取引法に基づく表示
          </Link>
          をご覧ください。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">これから</h2>
        <ul className="list-disc space-y-2 pl-5 text-gray-400">
          <li>
            <strong className="text-gray-300">邦楽の曲解説</strong>
            — 周辺の環境（データ・運用・品質）を整えたうえで、順次公開していく方針です。みんなで聴く無料の同時視聴は、姉妹サービス（ミュージックチャット）側でも邦楽を含めて拡げています。
          </li>
          <li>
            <strong className="text-gray-300">多言語化・同時翻訳</strong>
            — 将来的には先端技術を取り入れ、国を越えて交流できるサービスを目指します。時期や仕様は決まり次第お知らせします。
          </li>
        </ul>
        <p className="text-gray-400">
          料金や YouTube との関係など、よくある質問は{' '}
          <Link href={guideInternalHref('/guide/faq', searchParams)} className={linkClass}>
            よくある質問
          </Link>
          にまとめています。
        </p>
      </section>
    </div>
  );
}
