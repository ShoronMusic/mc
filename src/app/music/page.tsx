import Link from 'next/link';
import { MusicLibrarySongList } from '@/components/music-library/MusicLibrarySongList';
import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import {
  fetchMusicLibraryTopByStyle,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import { musicLibraryStyleHref } from '@/lib/music-library-urls';
import { isMcProduct } from '@/lib/product-mode';

export default async function MusicLibraryHomePage() {
  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const sections = await fetchMusicLibraryTopByStyle(admin, musicLibraryCatalogFilter());
  const merged = sections.flatMap((s) => s.songs);
  const mc = isMcProduct();
  const heading = mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white';
  const sub = mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400';
  const styleTitle = mc ? 'text-lg font-semibold text-gray-900' : 'text-lg font-semibold text-white';
  const more = mc ? 'text-sm text-gray-600 hover:underline' : 'text-sm text-amber-400/90 hover:underline';

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className={heading}>New Songs Across 9 Styles</h1>
        <p className={sub}>各スタイルの新着 3 曲。下のプレイヤーで連続再生できます。</p>
      </header>

      {merged.length > 0 ? (
        <MusicLibrarySongList songs={merged} loop hideList />
      ) : (
        <p className={sub}>まだ曲がありません。</p>
      )}

      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.slug} className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className={styleTitle}>{section.name}</h2>
              <Link href={musicLibraryStyleHref(section.slug, 1)} className={more}>
                一覧
              </Link>
            </div>
            {section.songs.length === 0 ? (
              <p className={sub}>曲がありません。</p>
            ) : (
              <ul className={mc ? 'space-y-1 text-sm text-gray-700' : 'space-y-1 text-sm text-gray-300'}>
                {section.songs.map((song) => (
                  <li key={song.id} className="truncate">
                    {song.href ? (
                      <Link href={song.href} className={mc ? 'hover:underline' : 'hover:text-white hover:underline'}>
                        {song.artistName} — {song.songTitle}
                      </Link>
                    ) : (
                      <span>
                        {song.artistName} — {song.songTitle}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
