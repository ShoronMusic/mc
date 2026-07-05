'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type AblyRoomTrafficState = {
  /** document.hidden（切断前の裏タブ状態） */
  documentHidden: boolean;
  /** 裏タブが長時間続き Ably 接続を切断した状態 */
  backgroundSuspended: boolean;
  /** 裏タブ中は定期 publish / presence 更新を止める */
  reduceTrafficWhenHidden: boolean;
};

const DEFAULT_STATE: AblyRoomTrafficState = {
  documentHidden: false,
  backgroundSuspended: false,
  reduceTrafficWhenHidden: true,
};

const AblyRoomTrafficContext = createContext<AblyRoomTrafficState>(DEFAULT_STATE);

export function AblyRoomTrafficProvider({
  value,
  children,
}: {
  value: AblyRoomTrafficState;
  children: ReactNode;
}) {
  return (
    <AblyRoomTrafficContext.Provider value={value}>{children}</AblyRoomTrafficContext.Provider>
  );
}

export function useAblyRoomTraffic(): AblyRoomTrafficState {
  return useContext(AblyRoomTrafficContext);
}

/** 裏タブ中または切断待ちで Ably 定期通信を止める */
export function shouldPauseAblyBackgroundTraffic(state: AblyRoomTrafficState): boolean {
  if (state.backgroundSuspended) return true;
  if (state.reduceTrafficWhenHidden && state.documentHidden) return true;
  return false;
}
