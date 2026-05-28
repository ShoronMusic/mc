'use client';

import { useEffect, useRef } from 'react';
import { getDisplayModeForAnalytics } from '@/lib/pwa-client';

type WindowWithGtag = Window & {
  gtag?: (...args: unknown[]) => void;
};

/** GA4 有効時のみ、初回に display_mode を 1 回送信（PWA 利用状況の目安） */
export default function PwaDisplayModeAnalytics() {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '';
    if (!measurementId) return;

    const w = window as WindowWithGtag;
    if (!w.gtag) return;

    sentRef.current = true;
    w.gtag('event', 'pwa_display_mode', {
      display_mode: getDisplayModeForAnalytics(),
    });
  }, []);

  return null;
}
