'use client';

type RoomAblySuspendedPlaceholderProps = {
  roomTitle?: string;
  roomDisplayTitle?: string;
  suspendAfterMinutes: number;
  onLeave: () => void;
};

/** 裏タブ長時間で Ably を切断したあとの待機画面 */
export function RoomAblySuspendedPlaceholder({
  roomTitle = '',
  roomDisplayTitle = '',
  suspendAfterMinutes,
  onLeave,
}: RoomAblySuspendedPlaceholderProps) {
  const title = roomDisplayTitle.trim() || roomTitle.trim() || '部屋';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 p-6 text-gray-100">
      <p className="text-lg font-medium">{title}</p>
      <p className="max-w-md text-center text-sm leading-relaxed text-gray-300">
        裏タブのまま{suspendAfterMinutes}分以上経過したため、通信を切断しました。
        <br />
        このタブを前面に戻すと自動で再接続します。
      </p>
      <button
        type="button"
        onClick={onLeave}
        className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
      >
        退室する
      </button>
    </div>
  );
}
