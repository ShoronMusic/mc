'use client';

import { IS_MC_PRODUCT } from '@/lib/product-branding';
import { useMusicLibraryStyleAdmin } from '@/components/music-library/MusicLibraryStyleAdminContext';

export function MusicLibraryStyleAdminLink({ href, label = '管理で編集' }: { href: string; label?: string }) {
  const allowed = useMusicLibraryStyleAdmin();
  if (!allowed || !href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        IS_MC_PRODUCT
          ? 'absolute right-0 top-0 z-10 text-[10px] text-gray-400 hover:text-gray-700'
          : 'absolute right-0 top-0 z-10 text-[10px] text-gray-500 hover:text-amber-200'
      }
    >
      {label}
    </a>
  );
}
