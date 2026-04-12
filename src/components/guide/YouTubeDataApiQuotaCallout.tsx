/**
 * YouTube Data API のクォータに起因する、曲解説等の途切れを利用者に伝える共通表示
 */
export function YouTubeDataApiQuotaCallout() {
  return (
    <aside
      className="rounded-lg border border-amber-500/55 bg-amber-950/40 px-4 py-3 text-sm shadow-sm"
      role="note"
      aria-label="YouTube データ取得の上限について"
    >
      <p className="font-semibold text-amber-200">YouTube（データ取得）の上限について</p>
      <p className="mt-2 leading-relaxed text-gray-300">
        曲情報の整理や<strong className="font-medium text-gray-200"> AI による曲解説</strong>
        など、一部の機能は Google の
        <strong className="font-medium text-gray-200"> YouTube Data API の利用枠</strong>
        に依存しています。
        <strong className="font-medium text-gray-200">
          {' '}
          動画の再生はできていても、急に解説や一部の表示が出なくなる
        </strong>
        ことがあります（枠の都合）。多くの場合、時間をおくと回復します。
      </p>
    </aside>
  );
}
