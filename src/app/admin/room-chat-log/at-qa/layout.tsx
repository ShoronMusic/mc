import { Suspense } from 'react';

export default function AdminRoomChatAtQaLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="min-h-screen bg-gray-950 p-4 text-gray-400">読み込み中…</p>}>
      {children}
    </Suspense>
  );
}
