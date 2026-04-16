'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/** 登録ユーザーの Supabase user.id。ゲストまたは未ログインは null。 */
export function useSupabaseAuthUserId(isGuest: boolean): string | null {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (isGuest) {
      setUserId(null);
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setUserId(null);
      return;
    }
    let cancelled = false;
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) setUserId(user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void supabase.auth.getUser().then(({ data: { user } }) => {
        if (!cancelled) setUserId(user?.id ?? null);
      });
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [isGuest]);

  return userId;
}
