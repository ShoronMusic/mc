'use client';

import { createBrowserClient } from '@supabase/ssr';
import { processLock } from '@supabase/supabase-js';
import type { LockFunc } from '@supabase/auth-js';

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (typeof url === 'string' && url.trim() !== '') return url.trim();
  return '';
}

function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (typeof key === 'string' && key.trim() !== '') return key.trim();
  return '';
}

/** GoTrue 既定 5s だと複数コンポーネントの同時 getUser でタイムアウトしやすい */
const AUTH_LOCK_ACQUIRE_MS =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'development' ? 30_000 : 15_000;

function isProcessLockAcquireTimeout(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'isAcquireTimeout' in error &&
    (error as { isAcquireTimeout?: boolean }).isAcquireTimeout === true
  );
}

/**
 * processLock の取得待ちが詰まったとき 1 回だけ再試行（dev Strict Mode・並列 getUser 対策）。
 * navigator.locks の steal 連鎖は避けたまま。
 */
const resilientProcessLock: LockFunc = async (name, _acquireTimeout, fn) => {
  const timeout = AUTH_LOCK_ACQUIRE_MS;
  try {
    return await processLock(name, timeout, fn);
  } catch (error) {
    if (!isProcessLockAcquireTimeout(error)) throw error;
    return await processLock(name, timeout, fn);
  }
};

/**
 * ブラウザ用 Supabase クライアント（@supabase/ssr シングルトン）。
 * auth.lock に processLock を使い、navigator.locks の steal 連鎖
 * （AbortError: Lock broken by another request with the 'steal' option）を避ける。
 * Next.js dev の Strict Mode 二重マウントでも安定する。
 */
export function createClient() {
  if (typeof window === 'undefined') return null;
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return null;
  return createBrowserClient(url, key, {
    auth: {
      lock: resilientProcessLock,
    },
  });
}

export function isSupabaseConfigured(): boolean {
  return !!getSupabaseUrl() && !!getSupabaseAnonKey();
}
