'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { readTermsAccepted } from '@/lib/terms-consent';

/**
 * 未同意のときは /consent へ送り、同意済みのときだけ子を表示（トップ・ルーム入室前のゲート）
 */
export function ConsentEntryGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!readTermsAccepted()) {
      router.replace(`/consent?next=${encodeURIComponent('/')}`);
      return;
    }
    setAllowed(true);
  }, [router]);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <p className="text-gray-400">読み込み中…</p>
      </div>
    );
  }

  return <>{children}</>;
}
