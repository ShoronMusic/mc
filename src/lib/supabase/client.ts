'use client';

import { createBrowserClient } from '@supabase/ssr';
import { processLock } from '@supabase/supabase-js';

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

/**
 * ブラウザ用 Supabase クライアント（@supabase/ssr シングルトン）。
 * auth.lock に processLock を使い、navigator.locks の steal 連鎖
 * （AbortError: Lock broken by another request with the 'steal' option）を避ける。
 * Next.js dev の Strict Mode 二重マウントでも安定する。
 */
export function createClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return null;
  return createBrowserClient(url, key, {
    auth: {
      lock: processLock,
    },
  });
}

export function isSupabaseConfigured(): boolean {
  return !!getSupabaseUrl() && !!getSupabaseAnonKey();
}
