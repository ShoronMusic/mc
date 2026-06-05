import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

async function readUserOnce(): Promise<User | null> {
  const supabase = createClient();
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) return session.user;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

async function tryRefreshSession(): Promise<User | null> {
  const supabase = createClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    return data.session?.user ?? null;
  } catch {
    return null;
  }
}

/**
 * PWA が YouTube 共有で冷起動したとき、getUser が一瞬 null になり JoinChoice が出るのを防ぐ。
 */
export async function resolveSupabaseUserClient(options?: {
  maxWaitMs?: number;
  tryRefreshSession?: boolean;
}): Promise<User | null> {
  const maxWaitMs = options?.maxWaitMs ?? 2500;
  let immediate = await readUserOnce();
  if (immediate) return immediate;

  if (options?.tryRefreshSession) {
    immediate = await tryRefreshSession();
    if (immediate) return immediate;
  }

  const supabase = createClient();
  if (!supabase) return null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
      resolve(user);
    };

    const timer = setTimeout(() => {
      void (async () => {
        let user = await readUserOnce();
        if (!user && options?.tryRefreshSession) {
          user = await tryRefreshSession();
        }
        finish(user);
      })();
    }, maxWaitMs);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) finish(session.user);
    });
  });
}

/** 共有受け口で部屋へ飛ぶ前に cookie セッションを温める */
export async function warmSupabaseSessionClient(): Promise<void> {
  await readUserOnce();
  await tryRefreshSession();
}
