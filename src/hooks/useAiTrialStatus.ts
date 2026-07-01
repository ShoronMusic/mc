'use client';

import { useEffect, useState } from 'react';
import { AI_TRIAL_STATUS_UPDATED_EVENT, type AiTrialStatus } from '@/lib/ai-trial-status';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function useAiTrialStatus(isGuest: boolean, refreshKey = 0) {
  const [state, setState] = useState<LoadState>(isGuest ? 'idle' : 'loading');
  const [status, setStatus] = useState<AiTrialStatus | null>(null);
  const [eventRefreshKey, setEventRefreshKey] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || isGuest) return;
    const onUpdate = () => setEventRefreshKey((k) => k + 1);
    window.addEventListener(AI_TRIAL_STATUS_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(AI_TRIAL_STATUS_UPDATED_EVENT, onUpdate);
  }, [isGuest]);

  useEffect(() => {
    if (isGuest) {
      setState('idle');
      setStatus(null);
      return;
    }
    let cancelled = false;
    setState('loading');
    void fetch('/api/user/ai-trial', { credentials: 'include' })
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as AiTrialStatus | { error?: string } | null;
        if (cancelled) return;
        if (!r.ok || !data || typeof data !== 'object' || 'error' in data) {
          setStatus(null);
          setState('error');
          return;
        }
        setStatus(data as AiTrialStatus);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setStatus(null);
          setState('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isGuest, refreshKey, eventRefreshKey]);

  return { status, state };
}
