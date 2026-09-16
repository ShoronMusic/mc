'use client';

import { useEffect, useState } from 'react';
import { IS_MC_PRODUCT } from '@/lib/product-branding';

/** サムネ無しでも名前列の開始位置を揃えるための幅。高さは付けない。 */
const SLOT = 'inline-block w-10 shrink-0';
const PHOTO = IS_MC_PRODUCT
  ? `${SLOT} h-10 overflow-hidden rounded border border-gray-200 bg-gray-100 object-cover`
  : `${SLOT} h-10 overflow-hidden rounded border border-white/15 bg-white/[0.04] object-cover`;

export function MusicLibraryArtistThumb({ url }: { url?: string | null }) {
  const [src, setSrc] = useState((url ?? '').trim() || null);

  useEffect(() => {
    setSrc((url ?? '').trim() || null);
  }, [url]);

  if (!src) {
    return <span className={SLOT} aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={PHOTO}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setSrc(null)}
    />
  );
}
