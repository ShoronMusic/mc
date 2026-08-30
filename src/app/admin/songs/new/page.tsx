import { Suspense } from 'react';
import { AdminNewSongForm } from './NewSongForm';

export default function AdminNewSongPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-950 p-8 text-sm text-gray-400">読み込み中…</div>
      }
    >
      <AdminNewSongForm />
    </Suspense>
  );
}
