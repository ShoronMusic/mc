'use client';

import { useParams } from 'next/navigation';
import { DomesticArtistEditor } from '@/components/admin/DomesticArtistEditor';

export default function AdminDomesticArtistEditPage() {
  const params = useParams();
  const artistId = typeof params.artistId === 'string' ? params.artistId : '';

  if (!artistId) {
    return <p className="p-8 text-gray-400">artistId が不正です。</p>;
  }

  return <DomesticArtistEditor mode="edit" artistId={artistId} />;
}
