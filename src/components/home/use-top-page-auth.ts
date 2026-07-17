'use client';

import { useEffect, useState } from 'react';
import { hasGuestRoomPersistence } from '@/lib/guest-room-persistence';
import { loadBrowserSupabaseClient } from '@/lib/supabase/load-browser-client';

type AuthState = boolean | null;

type Listener = (value: AuthState) => void;

/** undefined = 未開始 / null = 判定中 / boolean = 確定 */
let sharedState: AuthState | undefined;
let listeners = new Set<Listener>();
let bootstrapped = false;
let verifiedByGetUser = false;

function emit(value: AuthState) {
  sharedState = value;
  for (const listener of listeners) listener(value);
}

function bootstrapTopPageAuth() {
  if (bootstrapped) return;
  bootstrapped = true;

  if (typeof window === 'undefined') {
    emit(false);
    return;
  }
  if (hasGuestRoomPersistence()) {
    emit(false);
    return;
  }

  emit(null);

  void loadBrowserSupabaseClient().then(({ client, configured }) => {
    if (!configured || !client) {
      emit(false);
      return;
    }

    // ローカルセッションで UI を先に決める（複数 getUser のロック待ちを避ける）
    void client.auth.getSession().then(({ data }) => {
      if (!verifiedByGetUser) {
        emit(!!data.session?.user);
      }
    });

    void client.auth.getUser().then(({ data }) => {
      verifiedByGetUser = true;
      emit(!!data.user);
    });

    client.auth.onAuthStateChange((_event, session) => {
      emit(!!session?.user);
    });
  });
}

/**
 * トップページ全体で1回だけ auth を解決する。
 * 複数コンポーネントが同時 getUser すると processLock 待ちで右カラムが空のまま長引く。
 */
export function useTopPageLoggedIn(): AuthState {
  const [isLoggedIn, setIsLoggedIn] = useState<AuthState>(() =>
    sharedState === undefined ? null : sharedState,
  );

  useEffect(() => {
    const listener: Listener = (value) => setIsLoggedIn(value);
    listeners.add(listener);
    bootstrapTopPageAuth();
    if (sharedState !== undefined) setIsLoggedIn(sharedState);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return isLoggedIn;
}
