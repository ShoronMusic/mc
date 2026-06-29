import { Suspense } from 'react';
import { FromStartMarker } from '@/components/auth/FromStartMarker';
import { TopPageAuthBar } from '@/components/auth/TopPageAuthBar';
import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner';
import { AdminLoginHint } from '@/components/auth/AdminLoginHint';
import { StartPageMainCard } from '@/components/home/StartPageMainCard';
import { SessionReplacedNotice } from '@/components/home/SessionReplacedNotice';
import { SharePendingNotice } from '@/components/home/SharePendingNotice';

export default function StartPage() {
  return (
    <>
      <FromStartMarker />
      <TopPageAuthBar />
      <Suspense fallback={null}>
        <AuthErrorBanner />
      </Suspense>
      <Suspense fallback={null}>
        <div className="flex justify-center px-4 pt-14">
          <AdminLoginHint />
        </div>
      </Suspense>
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-4 pt-16">
        <SessionReplacedNotice />
        <SharePendingNotice />
        <StartPageMainCard />
      </div>
    </>
  );
}
