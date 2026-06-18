'use client';

type GuideEnjoyModalProps = {
  open: boolean;
  onClose: () => void;
  /** iframe の `returnTo`（部屋 ID など。先頭 / なし可） */
  returnToSegment?: string | null;
};

function guideEnjoyIframeSrc(returnToSegment?: string | null): string {
  const seg = returnToSegment?.trim();
  const returnQ = seg ? `&returnTo=${encodeURIComponent(seg)}` : '';
  return `/guide/enjoy?modal=1${returnQ}`;
}

export function GuideEnjoyModal({ open, onClose, returnToSegment = null }: GuideEnjoyModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="洋楽AIチャットの楽しみ方"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-700 px-3 py-2">
          <h2 className="truncate text-sm font-semibold text-white">洋楽AIチャットの楽しみ方</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
          >
            閉じる
          </button>
        </div>
        <iframe
          src={guideEnjoyIframeSrc(returnToSegment)}
          title="洋楽AIチャットの楽しみ方"
          className="min-h-0 w-full flex-1 border-0 bg-gray-950"
        />
      </div>
    </div>
  );
}
