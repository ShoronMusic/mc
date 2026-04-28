import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { AdminArtistJsonImportPanel } from '@/components/admin/AdminArtistJsonImportPanel';
import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';

type ArtistRow = {
  id: string;
  name: string;
  name_ja: string | null;
  music8_artist_slug: string | null;
  kind?: string | null;
  origin_country?: string | null;
  active_period?: string | null;
  members?: string | null;
  youtube_channel_title?: string | null;
  youtube_channel_url?: string | null;
  image_url?: string | null;
  image_credit?: string | null;
  profile_text?: string | null;
};

type SongRow = {
  id: string;
  song_title: string | null;
  display_title: string | null;
  style: string | null;
  play_count: number | null;
  original_release_date: string | null;
};

function normalizeArtistNameLoose(name: string): string {
  return name.replace(/^\s*(?:The|A|An)\s+/i, '').trim().toLowerCase();
}

export default async function AdminLibraryArtistPage({
  searchParams,
}: {
  searchParams: { name?: string };
}) {
  const artistName = (searchParams.name ?? '').trim();
  const admin = createAdminClient();
  const supabase = admin ?? (await createClient());

  if (!artistName) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl bg-gray-950 p-4 text-gray-100 sm:p-6">
        <AdminMenuBar />
        <h1 className="text-xl font-semibold text-white sm:text-2xl">アーティスト情報</h1>
        <p className="mt-3 text-sm text-gray-400">`name` クエリが必要です（例: `/admin/library/artist?name=The%20Police`）。</p>
      </main>
    );
  }

  if (!supabase) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl bg-gray-950 p-4 text-gray-100 sm:p-6">
        <AdminMenuBar />
        <h1 className="text-xl font-semibold text-white sm:text-2xl">アーティスト情報</h1>
        <p className="mt-3 text-sm text-red-400">DB が利用できません（SUPABASE_SERVICE_ROLE_KEY を確認）。</p>
      </main>
    );
  }

  let artist: ArtistRow | null = null;
  try {
    const { data } = await supabase
      .from('artists')
      .select('*')
      .or(`name.ilike.${artistName},music8_artist_slug.eq.${artistNameToMusic8Slug(artistName)}`)
      .limit(50);
    const rows = (data as ArtistRow[] | null) ?? [];
    if (rows.length > 0) {
      const q = normalizeArtistNameLoose(artistName);
      artist =
        rows.find((r) => normalizeArtistNameLoose(r.name ?? '') === q) ??
        rows.find((r) => typeof r.name === 'string' && r.name.toLowerCase() === artistName.toLowerCase()) ??
        rows[0];
    } else {
      artist = null;
    }
  } catch {
    artist = null;
  }

  let songs: SongRow[] = [];
  const { data: songsData } = await supabase
    .from('songs')
    .select('id, song_title, display_title, style, play_count, original_release_date')
    .eq('main_artist', artistName)
    .order('play_count', { ascending: false, nullsFirst: false })
    .order('original_release_date', { ascending: false, nullsFirst: false });
  songs = (songsData as SongRow[] | null) ?? [];

  const totalPlays = songs.reduce((sum, s) => sum + Math.max(0, s.play_count ?? 0), 0);

  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-gray-950 p-4 text-gray-100 sm:p-6">
      <AdminMenuBar />
      <div className="mb-3">
        <Link href="/admin/library" className="text-sm text-amber-200/90 hover:underline">
          ← ライブラリ一覧に戻る
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-white sm:text-2xl">アーティスト情報</h1>
      <p className="mt-1 text-sm text-gray-300">{artistName}</p>

      <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm">
        <h2 className="text-sm font-semibold text-amber-200">基本</h2>
        <dl className="mt-2 space-y-1 text-gray-300">
          <div>
            <dt className="inline text-gray-500">artists.id: </dt>
            <dd className="inline font-mono text-xs">{artist?.id ?? '—'}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">name_ja: </dt>
            <dd className="inline">{artist?.name_ja ?? '—'}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">music8_artist_slug: </dt>
            <dd className="inline font-mono text-xs">{artist?.music8_artist_slug ?? '—'}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">kind: </dt>
            <dd className="inline">{artist?.kind ?? '—'}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">origin_country: </dt>
            <dd className="inline">{artist?.origin_country ?? '—'}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">active_period: </dt>
            <dd className="inline">{artist?.active_period ?? '—'}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">members: </dt>
            <dd className="inline">{artist?.members ?? '—'}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">youtube_channel_title: </dt>
            <dd className="inline">{artist?.youtube_channel_title ?? '—'}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">youtube_channel_url: </dt>
            <dd className="inline break-all">
              {artist?.youtube_channel_url ? (
                <a
                  href={artist.youtube_channel_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:underline"
                >
                  {artist.youtube_channel_url}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="inline text-gray-500">image_url: </dt>
            <dd className="inline break-all">
              {artist?.image_url ? (
                <a
                  href={artist.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:underline"
                >
                  {artist.image_url}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="inline text-gray-500">image_credit: </dt>
            <dd className="inline">{artist?.image_credit ?? '—'}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">登録曲数: </dt>
            <dd className="inline tabular-nums">{songs.length}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">累計選曲回数: </dt>
            <dd className="inline tabular-nums">{totalPlays}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm">
        <h2 className="text-sm font-semibold text-amber-200">チャット読み込み用プロフィール</h2>
        {artist?.image_url ? (
          <div className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artist.image_url}
              alt={artistName}
              className="max-h-64 w-auto rounded border border-gray-800 bg-gray-950"
              loading="lazy"
            />
            {artist?.image_credit ? (
              <p className="mt-1 text-xs text-gray-500">{artist.image_credit}</p>
            ) : null}
          </div>
        ) : null}
        <p className="mt-2 whitespace-pre-wrap leading-relaxed text-gray-300">
          {artist?.profile_text?.trim() || '—'}
        </p>
      </section>

      <AdminArtistJsonImportPanel artistName={artistName} />

      <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm">
        <h2 className="text-sm font-semibold text-amber-200">曲一覧</h2>
        {songs.length === 0 ? (
          <p className="mt-3 text-gray-500">このアーティストの曲はまだありません。</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-xs text-gray-200">
              <thead className="border-b border-gray-700 text-gray-500">
                <tr>
                  <th className="py-2 pr-3 text-left font-medium">公開年</th>
                  <th className="py-2 pr-3 text-left font-medium">タイトル</th>
                  <th className="py-2 pr-3 text-left font-medium">スタイル</th>
                  <th className="py-2 pr-3 text-right font-medium">再生</th>
                  <th className="py-2 pl-2 text-left font-medium">詳細</th>
                </tr>
              </thead>
              <tbody>
                {songs.map((s) => {
                  const year =
                    s.original_release_date && s.original_release_date.length >= 4
                      ? s.original_release_date.slice(0, 4)
                      : '—';
                  const title = (s.song_title ?? s.display_title ?? '—').trim();
                  return (
                    <tr key={s.id} className="border-t border-gray-800/90">
                      <td className="py-2 pr-3 align-top text-gray-400">{year}</td>
                      <td className="py-2 pr-3 align-top">{title}</td>
                      <td className="py-2 pr-3 align-top text-gray-400">{s.style ?? '—'}</td>
                      <td className="py-2 pr-3 align-top text-right tabular-nums text-gray-400">
                        {s.play_count ?? 0}
                      </td>
                      <td className="py-2 pl-2 align-top">
                        <Link href={`/admin/songs/${s.id}`} className="text-amber-200/90 hover:underline">
                          DB
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

