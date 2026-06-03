'use client';

type RoomSessionTakeoverNoticeProps = {
  state: 'active' | 'supplanted';
  onTakeOverThisDevice: () => void;
};

/** 同一アカウント複数端末: どちらで操作するかを明示 */
export function RoomSessionTakeoverNotice({
  state,
  onTakeOverThisDevice,
}: RoomSessionTakeoverNoticeProps) {
  if (state === 'active') {
    return (
      <p className="mb-1 shrink-0 rounded border border-emerald-700/45 bg-emerald-950/35 px-2.5 py-1 text-[11px] leading-snug text-emerald-100">
        この端末で操作中（同じアカウントの他の端末は閲覧のみになります）
      </p>
    );
  }

  return (
    <div
      className="mb-1 shrink-0 rounded border border-amber-600/70 bg-amber-950/55 px-3 py-2 text-xs leading-snug text-amber-50"
      role="status"
      aria-live="polite"
    >
      <p className="font-medium">別の端末で同じアカウントが操作中です</p>
      <p className="mt-1 text-amber-100/90">
        この画面ではチャット送信・選曲・スキップなどができません。操作したい端末で下のボタンを押してください。
      </p>
      <button
        type="button"
        onClick={onTakeOverThisDevice}
        className="mt-2 rounded border border-amber-500/80 bg-amber-900/70 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-800/80"
      >
        この端末で操作する
      </button>
    </div>
  );
}
