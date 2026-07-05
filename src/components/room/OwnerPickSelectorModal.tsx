'use client';

import type { ParticipantItem } from '@/components/room/UserBar';

type OwnerPickSelectorModalProps = {
  participants: ParticipantItem[];
  onPick: (clientId: string) => void;
  onClose: () => void;
};

/** オーナー: 任意の参加者を次の選曲者として指名 */
export function OwnerPickSelectorModal({
  participants,
  onPick,
  onClose,
}: OwnerPickSelectorModalProps) {
  const selectable = participants.filter((p) => p.participatesInSelection !== false && p.isAway !== true);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-pick-selector-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-amber-700/60 bg-gray-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="owner-pick-selector-title" className="text-lg font-semibold text-amber-50">
          選曲者指名
        </h2>
        <p className="mt-2 text-sm text-gray-300">
          指名した参加者の予約曲があればすぐ再生します。なければ選曲を促します。
        </p>
        <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {selectable.map((p) => (
            <li key={p.clientId}>
              <button
                type="button"
                onClick={() => onPick(p.clientId)}
                className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-left text-sm text-gray-100 hover:bg-gray-700"
              >
                {p.displayName}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
