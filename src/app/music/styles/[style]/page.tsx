import { redirect } from 'next/navigation';
import { isMusicLibraryNavStyleSlug, musicLibraryStyleHref } from '@/lib/music-library-urls';
import { notFound } from 'next/navigation';

type Props = { params: { style: string } };

export default function MusicLibraryStyleIndexPage({ params }: Props) {
  const slug = (params.style ?? '').trim().toLowerCase();
  if (!isMusicLibraryNavStyleSlug(slug)) notFound();
  redirect(musicLibraryStyleHref(slug, 1));
}
