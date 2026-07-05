'use client';

type RoomInviteFriendsSectionProps = {
  onInviteClick: () => void;
};

export function RoomInviteFriendsSection({ onInviteClick }: RoomInviteFriendsSectionProps) {
  return (
    <div className="rounded border border-sky-700/50 bg-sky-900/20 p-3">
      <h3 className="text-sm font-medium text-sky-200">友達を招待</h3>
      <p className="mt-1 text-xs leading-relaxed text-gray-400">
        この部屋のURLを Gmail・Outlook・LINE で共有できます。部屋にいる間、誰でも利用できます。
      </p>
      <button
        type="button"
        onClick={onInviteClick}
        className="mt-2 rounded border border-sky-600 bg-sky-800/40 px-3 py-1.5 text-sm text-sky-100 hover:bg-sky-700/50"
      >
        招待リンクを送る
      </button>
    </div>
  );
}
