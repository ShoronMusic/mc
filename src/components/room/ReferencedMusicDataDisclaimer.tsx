/**
 * アーティスト／楽曲タブに表示する参照データ由来の注記（サービス名は出さない）
 */
export function ReferencedMusicDataDisclaimer() {
  return (
    <p className="mt-3 border-t border-gray-700/80 pt-2 text-[11px] leading-snug text-gray-500">
      表示は外部の参照データに基づく自動取得です。正確性・最新性・真偽、および再生中の楽曲・動画との一致を保証しません。公式・権利者の情報を優先してください。
    </p>
  );
}
