'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  isDocumentHiddenState,
  shouldSuspendAblyForHidden,
} from '@/lib/ably-background-suspend';
import {
  getAblyBackgroundSuspendMs,
  isAblyBackgroundSuspendDisabled,
} from '@/lib/ably-traffic-config';

export type UseAblyBackgroundSuspendResult = {
  enabled: boolean;
  documentHidden: boolean;
  backgroundSuspended: boolean;
};

/**
 * 裏タブが threshold 以上続いたら backgroundSuspended=true。
 * 前面復帰で false に戻す（Ably クライアントの再生成は親が担当）。
 */
export function useAblyBackgroundSuspend(): UseAblyBackgroundSuspendResult {
  const enabled = !isAblyBackgroundSuspendDisabled();
  const thresholdMs = getAblyBackgroundSuspendMs();

  const [documentHidden, setDocumentHidden] = useState(() =>
    typeof document !== 'undefined' ? isDocumentHiddenState(document.visibilityState) : false,
  );
  const [backgroundSuspended, setBackgroundSuspended] = useState(false);
  const [hiddenStartedAtMs, setHiddenStartedAtMs] = useState<number | null>(() => {
    if (typeof document === 'undefined') return null;
    return isDocumentHiddenState(document.visibilityState) ? Date.now() : null;
  });

  const syncFromVisibility = useCallback(() => {
    if (typeof document === 'undefined') return;
    const hidden = isDocumentHiddenState(document.visibilityState);
    setDocumentHidden(hidden);
    if (!enabled) return;

    if (hidden) {
      setHiddenStartedAtMs((prev) => prev ?? Date.now());
      return;
    }

    setHiddenStartedAtMs(null);
    setBackgroundSuspended(false);
  }, [enabled]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    syncFromVisibility();
    document.addEventListener('visibilitychange', syncFromVisibility);
    return () => document.removeEventListener('visibilitychange', syncFromVisibility);
  }, [syncFromVisibility]);

  useEffect(() => {
    if (!enabled || !documentHidden) return;

    const tick = () => {
      if (shouldSuspendAblyForHidden(hiddenStartedAtMs, Date.now(), thresholdMs)) {
        setBackgroundSuspended(true);
      }
    };

    tick();
    const id = window.setInterval(tick, 5_000);
    return () => window.clearInterval(id);
  }, [enabled, documentHidden, hiddenStartedAtMs, thresholdMs]);

  return {
    enabled,
    documentHidden,
    backgroundSuspended: enabled && backgroundSuspended,
  };
}
