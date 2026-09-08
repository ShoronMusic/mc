'use client';

import { useSyncExternalStore } from 'react';
import { hasGuestRoomPersistence } from '@/lib/guest-room-persistence';
import { loadBrowserSupabaseClient } from '@/lib/supabase/load-browser-client';
import { peekBrowserAuthLoggedIn } from '@/lib/supabase/peek-browser-auth';

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

function readImmediateAuthState(): boolean {
  if (hasGuestRoomPersistence()) return false;
  return peekBrowserAuthLoggedIn();
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

  // webpack チャンクや getUser を待たず、既存セッションで UI を先に出す
  emit(readImmediateAuthState());

  const fallbackTimer = window.setTimeout(() => {
    if (sharedState === null) {
      emit(readImmediateAuthState());
    }
  }, 2500);

  void loadBrowserSupabaseClient()
    .then(({ client, configured }) => {
      if (!configured || !client) {
        emit(false);
        return;
      }

      // getSession 完了後に getUser（並列だと processLock で両方止まる）
      void client.auth
        .getSession()
        .then(({ data }) => {
          if (!verifiedByGetUser) {
            emit(!!data.session?.user);
          }
          void client.auth
            .getUser()
            .then(({ data: userData }) => {
              verifiedByGetUser = true;
              emit(!!userData.user);
            })
            .catch(() => {
              verifiedByGetUser = true;
            });
        })
        .catch(() => {
          if (!verifiedByGetUser) emit(readImmediateAuthState());
        });

      client.auth.onAuthStateChange((_event, session) => {
        emit(!!session?.user);
      });
    })
    .catch(() => {
      if (sharedState === null) emit(readImmediateAuthState());
    })
    .finally(() => {
      window.clearTimeout(fallbackTimer);
    });
}

function subscribeTopPageAuth(listener: Listener) {
  listeners.add(listener);
  bootstrapTopPageAuth();
  return () => {
    listeners.delete(listener);
  };
}

function getTopPageAuthSnapshot(): AuthState {
  if (sharedState !== undefined) return sharedState;
  // getSnapshot は副作用禁止（hasGuestRoomPersistence は sessionStorage 移行で書く）
  return peekBrowserAuthLoggedIn();
}

function getTopPageAuthServerSnapshot(): AuthState {
  return null;
}

/**
 * トップページ全体で1回だけ auth を解決する。
 * 複数コンポーネントが同時 getUser すると processLock 待ちで右カラムが空のまま長引く。
 */
export function useTopPageLoggedIn(): AuthState {
  return useSyncExternalStore(
    subscribeTopPageAuth,
    getTopPageAuthSnapshot,
    getTopPageAuthServerSnapshot,
  );
}
