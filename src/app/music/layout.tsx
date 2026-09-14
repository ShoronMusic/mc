import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MusicLibraryShell } from '@/components/music-library/MusicLibraryShell';
import { getProductDisplayNamePlain } from '@/lib/product-branding';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Music Library | ${getProductDisplayNamePlain()}`,
  description: 'スタイル・アーティスト・曲を一覧し、YouTube 連続再生で聴けます。',
};

export default function MusicLibraryLayout({ children }: { children: ReactNode }) {
  return <MusicLibraryShell>{children}</MusicLibraryShell>;
}
