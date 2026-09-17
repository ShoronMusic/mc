import { notFound, redirect } from 'next/navigation';
import { musicLibraryGenreBestDetailHref } from '@/lib/music-library-urls';

type Props = { params: { slug: string } };

export default function MusicLibraryGenreBestSlugPage({ params }: Props) {
  const slug = (params.slug ?? '').trim();
  if (!slug) notFound();
  redirect(musicLibraryGenreBestDetailHref(slug, 1));
}
