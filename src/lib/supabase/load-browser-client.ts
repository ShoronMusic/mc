'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

export type BrowserSupabaseClient = SupabaseClient;

export async function loadBrowserSupabaseClient(): Promise<{
  client: BrowserSupabaseClient | null;
  configured: boolean;
}> {
  const { createClient, isSupabaseConfigured } = await import('./client');
  const client = createClient();
  return {
    client,
    configured: isSupabaseConfigured() && !!client,
  };
}
