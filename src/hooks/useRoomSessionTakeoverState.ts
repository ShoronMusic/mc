'use client';

import { useConnectionStateListener } from 'ably/react';
import { useEffect, useMemo, useState } from 'react';
import type { RoomSessionClaim } from '@/lib/room-session-instance';
import {
  detectRoomSessionTakeoverState,
  type PresenceAuthRow,
  type RoomSessionTakeoverState,
} from '@/lib/room-session-takeover';

const SUPPLANTED_DEBOUNCE_MS = 600;

export function useRoomSessionTakeoverState(input: {
  myClientId: string;
  mySessionClaim: RoomSessionClaim;
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
        mySessionClaim: input.mySessionClaim,
        authUserId: input.authUserId,
        isGuest: input.isGuest,
        presenceRows: input.presenceRows,
        connectionState,
      }),
    [
      input.myClientId,
      input.mySessionClaim,
      input.authUserId,
      input.isGuest,
      input.presenceRows,
      connectionState,
    ],
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
