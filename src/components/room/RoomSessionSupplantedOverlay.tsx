'use client';

type RoomSessionSupplantedOverlayProps = {
  onTakeOverThisDevice: () => void;
  onLeave: () => void;
};

/** 別端末が操作中: 部屋 UI の上に固定表示（レイアウトを伸ばさない） */
export function RoomSessionSupplantedOverlay({
  onTakeOverThisDevice,
  onLeave,
}: RoomSessionSupplantedOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-session-supplanted-title"
    >
      <div className="w-full max-w-md rounded-xl border border-amber-600/70 bg-gray-900 p-5 shadow-2xl">
        <h2 id="room-session-supplanted-title" className="text-base font-semibold text-amber-50">
          別の端末で操作中です
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-300">
          同じアカウントが、ほかの端末（スマホ・PC など）でこの部屋を操作しています。この画面では送信・選曲はできません。
        </p>
        <p className="mt-2 text-xs text-gray-400">
          「この端末で操作する」を押すと、数秒以内に切り替わります（再読み込みは不要です）。
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onLeave}
            className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
          >
            トップに戻る
          </button>
          <button
            type="button"
            onClick={onTakeOverThisDevice}
            className="rounded border border-amber-500/80 bg-amber-900/70 px-4 py-2 text-sm font-semibold text-amber-50 hover:bg-amber-800/80"
          >
            この端末で操作する
          </button>
        </div>
      </div>
    </div>
  );
}
