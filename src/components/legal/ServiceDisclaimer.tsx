/**
 * 免責・責任の範囲（現時点の運営方針を明記）
 * ご利用上の注意・同意画面・利用規約で共通利用
 */
export function ServiceDisclaimerIntro() {
  return (
    <p className="text-gray-400">
      現時点で、運営（洋楽AIチャットを運営する者。以下「運営」といいます）の責任について、次のとおり定めます。
    </p>
  );
}

export function ServiceDisclaimerList() {
  return (
    <ul className="list-disc space-y-2 pl-5 text-gray-400">
      <li>
        本サービスは<strong className="text-gray-300">現状有姿</strong>
        で提供します。正確性・完全性・有用性・特定目的への適合、不具合・中断・遅延が生じないこと、他者による迷惑・違法行為が行われないことについて、運営は
        <strong className="text-gray-300">いかなる保証も行いません</strong>。
      </li>
      <li>
        <strong className="text-gray-300">YouTube 等の第三者のサービス・コンテンツ</strong>、
        <strong className="text-gray-300">他の利用者の発言・行為</strong>、
        <strong className="text-gray-300">AI の出力</strong>、
        <strong className="text-gray-300">
          外部の参照データに基づき本サービス上に表示されるアーティスト名・楽曲に関する情報
        </strong>
        （経歴・クレジット・リリース日・ジャンル・スタイル・解説文等を含みます。正確性・真偽・網羅性・最新性および再生中の動画・楽曲との対応関係は保証されません）に起因するトラブルや損害について、
        <strong className="text-gray-300">運営に故意または重過失がある場合を除き</strong>、運営は責任を負いません。利用者同士の紛争は当事者間で解決してください。
      </li>
      <li>
        上記のほか、本サービスの<strong className="text-gray-300">利用または利用不能</strong>
        に関連して利用者に生じた損害（逸失利益、データの消失・改ざん、間接損害、精神的損害、付随的損害等を含みます）についても、
        <strong className="text-gray-300">運営に故意または重過失がある場合を除き</strong>、運営は賠償義務を負いません。
      </li>
      <li>
        消費者契約法その他の法令により前各号の全部または一部が無効とされる場合、またはその他の理由で運営に損害賠償その他の責任が認められる場合においても、運営が負う義務の内容・範囲は
        <strong className="text-gray-300">法令で認められる範囲</strong>に限ります。
      </li>
      <li>
        通信環境、メンテナンス、天災、停電、第三者のシステム障害等により本サービスが中断・遅延したことに起因する損害についても、運営に故意または重過失がある場合を除き、責任を負いません。
      </li>
    </ul>
  );
}
