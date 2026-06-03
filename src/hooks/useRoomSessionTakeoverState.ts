'use client';

import { useConnectionStateListener } from 'ably/react';
import { useEffect, useMemo, useState } from 'react';
import {
  detectRoomSessionTakeoverState,
  type PresenceAuthRow,
  type RoomSessionTakeoverState,
} from '@/lib/room-session-takeover';

const SUPPLANTED_DEBOUNCE_MS = 1200;

export function useRoomSessionTakeoverState(input: {
  myClientId: string;
  authUserId: string | null;
  isGuest: boolean;
  presenceRows: PresenceAuthRow[];
}): RoomSessionTakeoverState {
  const [connectionState, setConnectionState] = useState<string>('initialized');

  useConnectionStateListener((change) => {
    setConnectionState(change.current);
  });

  const raw = useMemo(
    () =>
      detectRoomSessionTakeoverState({
        myClientId: input.myClientId,
        authUserId: input.authUserId,
        isGuest: input.isGuest,
        presenceRows: input.presenceRows,
        connectionState,
      }),
    [input.myClientId, input.authUserId, input.isGuest, input.presenceRows, connectionState],
  );

  const [debounced, setDebounced] = useState<RoomSessionTakeoverState>(raw);

  useEffect(() => {
    if (raw !== 'supplanted') {
      setDebounced(raw);
      return;
    }
    const t = window.setTimeout(() => setDebounced('supplanted'), SUPPLANTED_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [raw]);

  return debounced;
}
