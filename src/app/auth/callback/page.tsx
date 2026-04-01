import { Suspense } from 'react';
import { AuthCallbackClient } from './AuthCallbackClient';

export const dynamic = 'force-dynamic';

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-4 text-gray-300">
          読み込み中…
        </div>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
