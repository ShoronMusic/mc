import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MusicLibraryShell } from '@/components/music-library/MusicLibraryShell';
import { MusicLibraryStyleAdminProvider } from '@/components/music-library/MusicLibraryStyleAdminContext';
import { sessionIsStyleAdmin } from '@/lib/admin-access';
import { getProductDisplayNamePlain } from '@/lib/product-branding';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Music Library | ${getProductDisplayNamePlain()}`,
  description: 'スタイル・アーティスト・曲を一覧し、YouTube 連続再生で聴けます。',
};

export default async function MusicLibraryLayout({ children }: { children: ReactNode }) {
  const isStyleAdmin = await sessionIsStyleAdmin();
  return (
    <MusicLibraryShell>
      <MusicLibraryStyleAdminProvider value={isStyleAdmin}>{children}</MusicLibraryStyleAdminProvider>
    </MusicLibraryShell>
  );
}
