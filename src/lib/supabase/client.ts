'use client';

import { createBrowserClient } from '@supabase/ssr';

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

export function createClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}

export function isSupabaseConfigured(): boolean {
  return !!getSupabaseUrl() && !!getSupabaseAnonKey();
}
