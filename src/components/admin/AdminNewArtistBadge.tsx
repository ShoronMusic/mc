/** 選曲／曲登録由来でまだ整備されていないアーティスト向けバッジ */
export function AdminNewArtistBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border border-amber-600/70 bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-200 ${className}`}
      title="曲登録・選曲で新規作成された未整備アーティストです。編集でプロフィール／Spotify 等を入れると消えます。"
    >
      新規アーティスト
    </span>
  );
}
