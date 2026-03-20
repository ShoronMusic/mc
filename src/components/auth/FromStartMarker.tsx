'use client';

import { useEffect } from 'react';

/** スタート画面（/）からルームへ遷移したことを記録。JoinGate で参加方法を必ず表示するために使う */
export const FROM_START_KEY = 'mc:from_start';

export function FromStartMarker() {
  useEffect(() => {
    try {
      sessionStorage.setItem(FROM_START_KEY, '1');
    } catch {}
  }, []);
  return null;
}
