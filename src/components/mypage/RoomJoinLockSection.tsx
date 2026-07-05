'use client';

import { LockClosedIcon, LockOpenIcon } from '@heroicons/react/24/outline';

type RoomJoinLockSectionProps = {
  joinLocked: boolean;
  saving?: boolean;
  onToggle: () => void;
};

export function RoomJoinLockSection({
  joinLocked,
  saving = false,
  onToggle,
}: RoomJoinLockSectionProps) {
  return (
    <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
      <h4 className="flex items-center gap-1.5 text-sm font-medium text-amber-200">
        {joinLocked ? (
          <LockClosedIcon className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <LockOpenIcon className="h-4 w-4 shrink-0" aria-hidden />
        )}
        新規参加の締切（鍵）
      </h4>
      <p className="mt-1 text-xs leading-relaxed text-gray-400">
        鍵を掛けると新規参加を締め切ります。既に参加済みのユーザーは再入室できます。ヘッダーに「新規参加締切中」と表示されます。
      </p>
      {joinLocked ? (
        <p className="mt-2 text-xs font-medium text-amber-200/90">現在：新規参加締切中</p>
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        disabled={saving}
        className={`mt-2 rounded border px-3 py-1.5 text-sm disabled:opacity-50 ${
          joinLocked
            ? 'border-amber-600 bg-amber-900/40 text-amber-200 hover:bg-amber-800/50'
            : 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700'
        }`}
        title={joinLocked ? '新規参加締切を解除する' : '新規参加を締め切る'}
      >
        {joinLocked ? '鍵を開ける' : '鍵を掛ける'}
      </button>
    </div>
  );
}
