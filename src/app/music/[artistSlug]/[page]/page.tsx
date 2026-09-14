import MusicLibraryArtistPage from '../page';

type Props = {
  params: { artistSlug: string; page: string };
  searchParams?: { autoplay?: string | string[]; i?: string | string[] };
};

export default function MusicLibraryArtistPagedPage({ params, searchParams }: Props) {
  return (
    <MusicLibraryArtistPage
      params={{ artistSlug: params.artistSlug, page: params.page }}
      searchParams={searchParams}
    />
  );
}
