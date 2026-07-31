import { AiCreditsPricingGuideLink } from '@/components/legal/AiCreditsPricingGuide';
import { AI_CREDITS_FREE_FEATURES } from '@/lib/ai-credits-pricing-guide';
import { IS_MC_PRODUCT } from '@/lib/product-branding';

/**
 * 利用料金（サービス全体）— 利用規約・ガイド・同意画面で共通
 * AI の詳細は {@link AiCreditsPricingGuide} / `/guide/ai-pricing` に集約
 * mc では AI 課金の説明を出さない（完全無料）。
 */
export function ServicePricingNotice() {
  if (IS_MC_PRODUCT) {
    return (
      <div className="space-y-3 text-gray-600">
        <p>
          Music Chat（ミュージックチャット）は、<strong className="text-gray-800">YouTube 動画の同時視聴とチャット</strong>
          を楽しむためのサービスで、<strong className="text-gray-800">完全無料</strong>です（邦楽・洋楽どちらも選曲できます）。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>部屋での同期視聴・チャット</li>
          <li>ゲスト参加・登録参加</li>
          <li>マイリスト・視聴履歴（アカウントがある場合）</li>
        </ul>
        <p>
          インターネット接続や第三者サービス（動画配信等）の利用に伴う通信料金等は、利用者ご自身の負担となります。無料の範囲は、運営の判断により予告なく変更される場合があります。変更時は法令に従い、本サービス上または運営が適切と判断する方法でお知らせします。
        </p>
        <p>
          姉妹サイトの洋楽AIチャットとは、同じ Google アカウント（または同じメール）で利用でき、マイリストなども共通です。両方を同時に開いて使うこともできます。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-gray-400">
      <p>
        本サービスは、<strong className="text-gray-300">YouTube 動画の同時視聴とチャット</strong>
        による洋楽鑑賞を中心としたコミュニティです。次の機能は
        <strong className="text-gray-300">無料</strong>です。
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {AI_CREDITS_FREE_FEATURES.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>
        <strong className="text-gray-300">AI 機能</strong>（曲解説・@ 質問・曲クイズ等）はクラウド AI
        の利用原価がかかるため、<strong className="text-gray-300">基本は有料</strong>です。無料登録ユーザーにはお試し枠があります（原則 1 アカウント生涯 1 回。付与は初回の AI 実利用時、メール登録では確認後の短い待機や同一ネットワーク上限がある場合があります）。クレジットの消費単位・購入価格・前払いについては、
        <AiCreditsPricingGuideLink /> をご確認ください。
        AI エージェントによる選曲参加は参加者のクレジットを消費せず、サイト運営側が負担します。
      </p>
      <p>
        インターネット接続や第三者サービス（動画配信等）の利用に伴う通信料金等は、利用者ご自身の負担となります。無料の範囲・お試し枠・価格・課金方式は、運営の判断により予告なく変更される場合があります。変更時は法令に従い、本サービス上または運営が適切と判断する方法でお知らせします。
      </p>
      <p>
        姉妹サイトのミュージックチャットとは、同じ Google アカウント（または同じメール）で利用でき、マイリストなども共通です。両方を同時に開いて使うこともできます。
      </p>
    </div>
  );
}

/** ガイド目次・選曲案内など、短い参照用 */
export function ServicePricingNoticeBrief() {
  if (IS_MC_PRODUCT) {
    return (
      <p className="text-gray-600">
        <strong className="text-gray-800">YouTube の同時視聴とチャット</strong>は完全無料です。
      </p>
    );
  }
  return (
    <p className="text-gray-400">
      <strong className="text-gray-300">YouTube の同時視聴とチャット</strong>は無料、
      <strong className="text-gray-300">AI 機能</strong>は基本有料です（AI エージェントの選曲参加はサイト側負担）。詳細は{' '}
      <AiCreditsPricingGuideLink /> をご覧ください。
    </p>
  );
}
