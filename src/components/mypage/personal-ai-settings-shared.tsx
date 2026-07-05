'use client';

export function PersonalAiOwnerCeilingNote({
  roomEnabled,
  featureLabel,
}: {
  roomEnabled: boolean;
  featureLabel: string;
}) {
  return (
    <p className="mt-1 text-[11px] leading-snug text-gray-500">
      部屋の{featureLabel}:{' '}
      <span className={roomEnabled ? 'text-emerald-400/90' : 'text-amber-300'}>
        {roomEnabled ? 'ON' : 'OFF'}
      </span>
      {roomEnabled ? ' — 下のスイッチで自分だけオフにできます' : ' → 自分をオンにしても出ません'}
    </p>
  );
}

export function PersonalAiSettingsPolicySummary() {
  return (
    <div className="mt-3 rounded border border-violet-800/50 bg-gray-900/60 px-2.5 py-2 text-[11px] leading-relaxed text-gray-400">
      <p className="font-medium text-violet-200/90">ルール（自分の選曲時のみ）</p>
      <ul className="mt-1 list-inside list-disc space-y-0.5">
        <li>部屋が OFF → 自分 ON 不可</li>
        <li>部屋が ON → 自分だけ OFF 可（枠節約）</li>
        <li>曲クイズ → 部屋・自分の解説が ON のときだけ ON 可</li>
      </ul>
    </div>
  );
}

export function PersonalAiAgentOwnerNote({
  agentJoinEnabled,
  inSyncedRoom,
  showOwnerTabLink,
  onOpenOwnerTab,
}: {
  agentJoinEnabled: boolean;
  inSyncedRoom: boolean;
  showOwnerTabLink: boolean;
  onOpenOwnerTab: () => void;
}) {
  return (
    <div className="mt-5 rounded border border-amber-800/45 bg-amber-950/25 px-2.5 py-2.5">
      <p className="text-xs font-medium text-amber-200/95">AI エージェント（オーナー権限・部屋全体）</p>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
        チャットヘッダーの「AI参加」と連動します。上の解説・クイズ・おすすめは
        <strong className="font-normal text-gray-300">自分の選曲</strong>
        だけの設定ですが、エージェントは
        <strong className="font-normal text-gray-300">オーナーが部屋設定で決める全員共通</strong>
        の機能です。この欄では ON/OFF できません。
      </p>
      {inSyncedRoom ? (
        <p className="mt-1.5 text-[11px] text-gray-500">
          この部屋の状態:{' '}
          <span className={agentJoinEnabled ? 'text-emerald-400/90' : 'text-gray-400'}>
            {agentJoinEnabled ? '参加オン' : '参加オフ'}
          </span>
        </p>
      ) : null}
      {showOwnerTabLink ? (
        <button
          type="button"
          onClick={onOpenOwnerTab}
          className="mt-2 text-[11px] text-violet-300 underline decoration-dotted underline-offset-2 hover:text-violet-200"
        >
          部屋設定（オーナー）で AI エージェントを変更
        </button>
      ) : (
        <p className="mt-1.5 text-[11px] text-gray-500">変更はチャットオーナーにお願いしてください。</p>
      )}
    </div>
  );
}

export function PersonalAiUserOnOffButtons({
  enabled,
  saving,
  onEnable,
  onDisable,
  disableEnable = false,
  disableEnableTitle,
  hideWhenUnavailable = false,
}: {
  enabled: boolean;
  saving: boolean;
  onEnable: () => void;
  onDisable: () => void;
  disableEnable?: boolean;
  disableEnableTitle?: string;
  hideWhenUnavailable?: boolean;
}) {
  if (hideWhenUnavailable) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={saving || disableEnable}
        title={disableEnable ? disableEnableTitle : undefined}
        onClick={onEnable}
        className={`rounded px-3 py-1.5 text-sm ${
          enabled ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        } disabled:cursor-not-allowed disabled:opacity-45`}
      >
        オン
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={onDisable}
        className={`rounded px-3 py-1.5 text-sm ${
          !enabled ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        } disabled:opacity-50`}
      >
        オフ
      </button>
    </div>
  );
}
