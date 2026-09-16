import MusicLibraryArtistLetterPage from '../page';

type Props = {
  params: { letter: string; page: string };
  searchParams?: { sort?: string | string[]; dir?: string | string[] };
};

export default function MusicLibraryArtistLetterPagedPage({ params, searchParams }: Props) {
  return (
    <MusicLibraryArtistLetterPage
      params={{ letter: params.letter, page: params.page }}
      searchParams={searchParams}
    />
  );
}
