import { createClient } from '@supabase/supabase-js';

function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof key === 'string' && key.trim() !== '') return key.trim();
  return '';
}

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (typeof url === 'string' && url.trim() !== '') return url.trim();
  return '';
}

/** サーバー専用。SUPABASE_SERVICE_ROLE_KEY を .env.local に設定すること。 */
export function createAdminClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          // Next.js のサーバー fetch キャッシュで PostgREST 応答が古く残るのを防ぐ。
          cache: 'no-store',
        }),
    },
  });
}
