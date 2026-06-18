'use client';

import { useAbly, useChannelStateListener, useConnectionStateListener } from 'ably/react';
import { useCallback, useEffect, useRef, useState } from 'react';

const INACTIVE_CONNECTION = new Set(['suspended', 'closing', 'closed', 'failed']);

/**
 * usePresence の代替。接続・チャネル準備完了後だけ enter し、失敗は握りつぶしてページを落とさない。
 */
export function useRoomAblyPresence<T extends object>(
  channelName: string,
  presenceData: T,
  options?: { skip?: boolean },
) {
  const ably = useAbly();
  const channel = ably.channels.get(channelName);
  const skip = options?.skip ?? false;
  const dataRef = useRef(presenceData);
  dataRef.current = presenceData;

  const [connectionState, setConnectionState] = useState(ably.connection.state);
  useConnectionStateListener((change) => {
    setConnectionState(change.current);
  });

  const [channelState, setChannelState] = useState(channel.state);
  useChannelStateListener({ channelName }, (change) => {
    setChannelState(change.current);
  });

  const shouldEnter = !skip && connectionState === 'connected' && channelState === 'attached';

  useEffect(() => {
    if (!shouldEnter) return;

    let cancelled = false;
    const enter = async () => {
      try {
        if (channel.state !== 'attached') {
          await channel.attach();
        }
        if (cancelled) return;
        await channel.presence.enter(dataRef.current);
      } catch (err) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('[Ably] presence enter failed (ignored):', err);
        }
      }
    };
    void enter();

    return () => {
      cancelled = true;
      if (INACTIVE_CONNECTION.has(ably.connection.state)) return;
      if (channel.state !== 'attached') return;
      void channel.presence.leave().catch(() => {});
    };
  }, [shouldEnter, channel, ably, channelName]);

  const updateStatus = useCallback(
    async (data: T) => {
      try {
        await channel.presence.update(data);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[Ably] presence update failed (ignored):', err);
      }
    },
    [channel],
  );

  return { updateStatus, connectionState, channelState };
}
