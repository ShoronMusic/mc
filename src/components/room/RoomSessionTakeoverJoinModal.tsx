'use client';

type RoomSessionTakeoverJoinModalProps = {
  roomId: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 入室前: 同じアカウントが既に部屋にいるときの確認 */
export function RoomSessionTakeoverJoinModal({
  roomId,
  onConfirm,
  onCancel,
}: RoomSessionTakeoverJoinModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-session-join-title"
    >
      <div className="w-full max-w-md rounded-xl border border-amber-600/70 bg-gray-900 p-5 shadow-2xl">
        <h2 id="room-session-join-title" className="text-base font-semibold text-amber-50">
          同じアカウントが既に参加中です
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-300">
          部屋 <span className="font-mono text-amber-100">{roomId}</span>{' '}
          には、同じアカウントが別の端末で入っています。
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-300">
          <strong className="font-medium text-gray-100">この端末で参加</strong>
          すると、先に入っていた端末は操作できなくなります。どちらか一方だけが操作できます。
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded border border-lime-600/80 bg-lime-900/50 px-4 py-2 text-sm font-semibold text-lime-50 hover:bg-lime-800/60"
          >
            この端末で参加する
          </button>
        </div>
      </div>
    </div>
  );
}
