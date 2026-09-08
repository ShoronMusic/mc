'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, isSupabaseConfigured } from './client';

export type BrowserSupabaseClient = SupabaseClient;

/**
 * ブラウザ用クライアントを返す。
 * 動的 import だと webpack が app/layout チャンクを再取得して ChunkLoadError になりやすいため静的 import。
 */
export async function loadBrowserSupabaseClient(): Promise<{
  client: BrowserSupabaseClient | null;
  configured: boolean;
}> {
  const client = createClient();
  return {
    client,
    configured: isSupabaseConfigured() && !!client,
  };
}
