import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { AdminArtistDeletePanel } from '@/components/admin/AdminArtistDeletePanel';
import { WesternArtistPlaylistImportPanel } from '@/components/admin/WesternArtistPlaylistImportPanel';
import { GenreBestArtistSongList } from '@/components/admin/GenreBestArtistSongList';
import { artistNameToMusic8Slug, formatArtistBorn, formatArtistDied } from '@/lib/music8-artist-display';
import { loadArtistMemberGraph, type ArtistMemberLink } from '@/lib/artist-members';
import { rankLibraryVideoVariant } from '@/lib/library-video-variant-rank';
import { pickArtistPhotoUrl } from '@/lib/artist-photo-url';
import { buildLibraryArtistExternalLinks } from '@/lib/library-artist-public-display';

type ArtistRow = {
  id: string;
  name: string;
  name_ja: string | null;
  name_en?: string | null;
  music8_artist_slug: string | null;
  music8_artist_id?: number | null;
  music8_synced_at?: string | null;
  kind?: string | null;
  occupations?: string[] | null;
  origin_country?: string | null;
  catalog_scope?: string | null;
  active_period?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  members?: string | null;
  youtube_channel_id?: string | null;
  youtube_channel_title?: string | null;
  youtube_channel_url?: string | null;
  spotify_artist_id?: string | null;
  spotify_artist_images?: string | null;
  wikipedia_page?: string | null;
  image_url?: string | null;
  image_credit?: string | null;
  profile_text?: string | null;
  description_en?: string | null;
};

type SongRow = {
  id: string;
  song_title: string | null;
  display_title: string | null;
  style: string | null;
  play_count: number | null;
  original_release_date: string | null;
  spotify_images: string | null;
  video_id: string | null;
};

function normalizeArtistNameLoose(name: string): string {
  return name.replace(/^\s*(?:The|A|An)\s+/i, '').trim().toLowerCase();
}

function adminArtistHref(link: ArtistMemberLink): string {
  const slug = (link.music8_artist_slug ?? '').trim();
  if (slug) return `/admin/library/artist?slug=${encodeURIComponent(slug)}`;
  return `/admin/library/artist?name=${encodeURIComponent(link.name)}`;
}

function ArtistRelationLinks({ links }: { links: ArtistMemberLink[] }) {
  if (links.length === 0) return <span className="text-gray-500">—</span>;
  return (
    <span>
      {links.map((link, i) => (
        <span key={link.id}>
          {i > 0 ? '、' : null}
          <Link href={adminArtistHref(link)} className="text-sky-400 hover:underline">
            {link.name}
          </Link>
        </span>
      ))}
    </span>
  );
}

function occupationLabel(artist: ArtistRow | null): string | null {
  if (!artist) return null;
  const occ = Array.isArray(artist.occupations)
    ? artist.occupations.map((s) => s.trim()).filter(Boolean)
    : [];
  if (occ.length > 0) return occ.join(', ');
  const kind = (artist.kind ?? '').trim();
  return kind || null;
}

export default async function AdminLibraryArtistPage({
  searchParams,
}: {
  searchParams: { name?: string; slug?: string };
}) {
  const nameQuery = (searchParams.name ?? '').trim();
  const slugQuery = (searchParams.slug ?? '').trim();
  const admin = createAdminClient();
  const supabase = admin ?? (await createClient());

  if (!nameQuery && !slugQuery) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl bg-gray-950 p-4 text-gray-100 sm:p-6">
        <AdminMenuBar />
        <h1 className="text-xl font-semibold text-white sm:text-2xl">アーティスト情報</h1>
        <p className="mt-3 text-sm text-gray-400">
          `name` または `slug` クエリが必要です（例: `/admin/library/artist?name=サカナクション` または
          `/admin/library/artist?slug=sakanaction`）。
        </p>
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
    if (slugQuery) {
      const { data } = await supabase
        .from('artists')
        .select('*')
        .eq('music8_artist_slug', slugQuery)
        .limit(5);
      const rows = (data as ArtistRow[] | null) ?? [];
      artist = rows[0] ?? null;
    }
    if (!artist && nameQuery) {
      const { data } = await supabase
        .from('artists')
        .select('*')
        .or(`name.ilike.${nameQuery},music8_artist_slug.eq.${artistNameToMusic8Slug(nameQuery)}`)
        .limit(50);
      const rows = (data as ArtistRow[] | null) ?? [];
      if (rows.length > 0) {
        const q = normalizeArtistNameLoose(nameQuery);
        artist =
          rows.find((r) => normalizeArtistNameLoose(r.name ?? '') === q) ??
          rows.find((r) => typeof r.name === 'string' && r.name.toLowerCase() === nameQuery.toLowerCase()) ??
          rows[0];
      }
    }
  } catch {
    artist = null;
  }

  let memberGraph: { members: ArtistMemberLink[]; bands: ArtistMemberLink[] } = {
    members: [],
    bands: [],
  };
  if (artist?.id) {
    try {
      memberGraph = await loadArtistMemberGraph(supabase, artist.id);
    } catch {
      memberGraph = { members: [], bands: [] };
    }
  }

  const displayName =
    (artist?.name?.trim() || artist?.name_en?.trim() || artist?.name_ja?.trim() || nameQuery || slugQuery).trim() ||
    '—';
  const nameJa = (artist?.name_ja ?? '').trim();
  const nameEn = (artist?.name_en ?? '').trim();
  const origin = (artist?.origin_country ?? '').trim();
  const occupation = occupationLabel(artist);
  const photoUrl = artist ? pickArtistPhotoUrl(artist) : null;
  const links = buildLibraryArtistExternalLinks({
    youtube_channel_url: artist?.youtube_channel_url,
    youtube_channel_id: artist?.youtube_channel_id,
    spotify_artist_id: artist?.spotify_artist_id,
    wikipedia_page: artist?.wikipedia_page,
  });
  const songArtistKeys = Array.from(
    new Set(
      [artist?.name, artist?.name_ja, nameQuery]
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean),
    ),
  );

  let songs: SongRow[] = [];
  if (songArtistKeys.length > 0) {
    const { data: songsData } = await supabase
      .from('songs')
      .select(
        'id, song_title, display_title, style, play_count, original_release_date, spotify_images, music8_video_id',
      )
      .in('main_artist', songArtistKeys)
      .order('play_count', { ascending: false, nullsFirst: false })
      .order('original_release_date', { ascending: false, nullsFirst: false });
    const rawSongs = (songsData as Array<{
      id: string;
      song_title: string | null;
      display_title: string | null;
      style: string | null;
      play_count: number | null;
      original_release_date: string | null;
      spotify_images?: string | null;
      music8_video_id?: string | null;
    }> | null) ?? [];
    const videoBySong = new Map<string, string>();
    const ids = rawSongs.map((s) => s.id).filter(Boolean);
    if (ids.length > 0) {
      const { data: vidRows } = await supabase
        .from('song_videos')
        .select('song_id, video_id, variant')
        .in('song_id', ids);
      if (Array.isArray(vidRows)) {
        const ranked = new Map<string, { videoId: string; rank: number }>();
        for (const r of vidRows as { song_id?: string; video_id?: string; variant?: string | null }[]) {
          if (!r.song_id || !r.video_id) continue;
          const nextRank = rankLibraryVideoVariant(r.variant);
          const cur = ranked.get(r.song_id);
          if (!cur || nextRank < cur.rank) {
            ranked.set(r.song_id, { videoId: r.video_id, rank: nextRank });
          }
        }
        for (const [songId, picked] of ranked) {
          videoBySong.set(songId, picked.videoId);
        }
      }
    }
    songs = rawSongs.map((s) => ({
      id: s.id,
      song_title: s.song_title,
      display_title: s.display_title,
      style: s.style,
      play_count: s.play_count,
      original_release_date: s.original_release_date,
      spotify_images:
        typeof s.spotify_images === 'string' && s.spotify_images.trim() ? s.spotify_images.trim() : null,
      video_id:
        (typeof s.music8_video_id === 'string' && s.music8_video_id.trim()) ||
        videoBySong.get(s.id) ||
        null,
    }));
  }

  const birthDisplay = artist?.birth_date
    ? formatArtistBorn(artist.birth_date, artist.death_date) || artist.birth_date
    : null;
  const deathDisplay = artist?.death_date
    ? formatArtistDied(artist.death_date, artist.birth_date) || artist.death_date
    : null;
  const descriptionEn = (artist?.description_en ?? '').trim();
  const profileText = (artist?.profile_text ?? '').trim();
  const imageCredit = (artist?.image_credit ?? '').trim();

  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-gray-950 p-4 text-gray-100 sm:p-6">
      <AdminMenuBar />
      <div className="mb-3">
        <Link href="/admin/library" className="text-sm text-amber-200/90 hover:underline">
          ← ライブラリ一覧に戻る
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-white sm:text-2xl">アーティスト情報</h1>

      <div className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-gray-300">
        <p className="font-medium text-amber-200/90">正本は artists テーブルです</p>
        <p className="mt-1">
          プロフィール・出身国・メンバー等は DB を直接編集します。公開 Music8 JSON
          からの個別取り込みはしません（キャッシュを正本に戻すと手修正が消えます）。
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {artist?.id ? (
            <Link
              href={`/admin/domestic-artist-register/${artist.id}`}
              className="font-medium text-emerald-400 hover:underline"
            >
              アーティストを編集
            </Link>
          ) : (
            <Link
              href={`/admin/domestic-artist-register/new?name=${encodeURIComponent(displayName === '—' ? nameQuery || slugQuery : displayName)}&autoload=1`}
              className="font-medium text-emerald-400 hover:underline"
            >
              アーティスト新規（名前で開く）
            </Link>
          )}
          <Link href="/admin/domestic-artist-register" className="text-sky-400 hover:underline">
            アーティスト登録一覧
          </Link>
          <Link href="/admin/youtube-playlist-import" className="text-sky-400 hover:underline">
            汎用プレイリスト取込
          </Link>
          <Link href="/admin/artists-newly-registered" className="text-sky-400 hover:underline">
            選曲登録アーティスト（日別）
          </Link>
        </div>
      </div>
      {!artist ? (
        <p className="mt-2 text-sm text-amber-200/90">
          artists テーブルに一致する行がありません（クエリ:{' '}
          {nameQuery ? `name=${nameQuery}` : ''}
          {nameQuery && slugQuery ? ' / ' : ''}
          {slugQuery ? `slug=${slugQuery}` : ''}
          ）。曲一覧は名前一致のみ表示します。
        </p>
      ) : null}

      {/* Music8 公開ページに近いプロフィールカード */}
      <section className="mt-6 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.9)]">
        <div className="grid gap-0 md:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
          <div className="border-b border-gray-800 bg-black/40 md:border-b-0 md:border-r">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={displayName}
                className="aspect-[3/4] w-full object-cover md:min-h-[22rem]"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex aspect-[3/4] min-h-[14rem] items-center justify-center bg-gray-950 text-xs text-gray-600 md:min-h-[22rem]">
                画像なし
              </div>
            )}
            <p className="border-t border-gray-800 px-3 py-2 text-[11px] text-gray-500">
              {imageCredit
                ? imageCredit
                : photoUrl
                  ? 'Artist image（image_url / Spotify）'
                  : '画像未設定'}
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
            <div>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  {displayName}
                </h2>
                {origin ? (
                  <span className="rounded border border-gray-600 bg-gray-950 px-1.5 py-0.5 text-[11px] font-medium text-gray-300">
                    {origin}
                  </span>
                ) : null}
              </div>
              {nameJa && nameJa !== displayName ? (
                <p className="mt-1 text-base text-gray-300">{nameJa}</p>
              ) : null}
              {nameEn && nameEn !== displayName && nameEn !== nameJa ? (
                <p className="mt-0.5 text-sm text-gray-500">{nameEn}</p>
              ) : null}
            </div>

            <div className="space-y-1 text-sm text-gray-300">
              {occupation ? <p className="text-gray-200">{occupation}</p> : null}
              {(artist?.active_period ?? '').trim() ? (
                <p>
                  <span className="text-gray-500">Active: </span>
                  {(artist?.active_period ?? '').trim()}
                </p>
              ) : null}
              {birthDisplay ? (
                <p>
                  <span className="text-gray-500">Born: </span>
                  {birthDisplay}
                </p>
              ) : null}
              {deathDisplay ? (
                <p>
                  <span className="text-gray-500">Died: </span>
                  {deathDisplay}
                </p>
              ) : null}
              {memberGraph.bands.length > 0 ? (
                <p>
                  <span className="text-gray-500">所属バンド: </span>
                  <ArtistRelationLinks links={memberGraph.bands} />
                </p>
              ) : null}
              {memberGraph.members.length > 0 ? (
                <p>
                  <span className="text-gray-500">Members: </span>
                  <ArtistRelationLinks links={memberGraph.members} />
                </p>
              ) : (artist?.members ?? '').trim() ? (
                <p>
                  <span className="text-gray-500">Members: </span>
                  {(artist?.members ?? '').trim()}
                </p>
              ) : null}
            </div>

            {(descriptionEn || profileText) && (
              <div className="space-y-3 border-t border-gray-800 pt-3 text-sm leading-relaxed">
                {descriptionEn ? (
                  <p className="whitespace-pre-wrap text-gray-400">{descriptionEn}</p>
                ) : null}
                {profileText ? (
                  <p className="whitespace-pre-wrap text-gray-200">{profileText}</p>
                ) : null}
              </div>
            )}

            <div className="mt-auto flex flex-wrap gap-2 border-t border-gray-800 pt-3">
              {links.wikipedia ? (
                <a
                  href={links.wikipedia}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-gray-600 bg-gray-950 px-2.5 py-1.5 text-xs text-sky-300 hover:border-sky-600"
                >
                  Wikipedia
                </a>
              ) : null}
              {links.spotify ? (
                <a
                  href={links.spotify}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-green-800/80 bg-green-950/40 px-2.5 py-1.5 text-xs text-green-200 hover:border-green-600"
                >
                  Spotify
                </a>
              ) : null}
              {links.youtube ? (
                <a
                  href={links.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-red-900/70 bg-red-950/30 px-2.5 py-1.5 text-xs text-red-200 hover:border-red-700"
                >
                  YouTube
                </a>
              ) : null}
              {!links.wikipedia && !links.spotify && !links.youtube ? (
                <span className="text-xs text-gray-600">外部リンク未設定</span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <WesternArtistPlaylistImportPanel
        artistName={
          (artist?.name ?? (displayName === '—' ? nameQuery || slugQuery : displayName)).trim()
        }
        nameEn={artist?.name ?? null}
        youtubeChannelId={artist?.youtube_channel_id ?? null}
      />

      {artist?.id ? (
        <AdminArtistDeletePanel
          artistId={artist.id}
          artistName={(artist.name ?? displayName).trim() || displayName}
          songCount={songs.length}
        />
      ) : null}

      <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm">
        <h2 className="text-sm font-semibold text-amber-200">
          曲一覧
          <span className="ml-2 font-normal text-gray-500">（{songs.length}）</span>
        </h2>
        <GenreBestArtistSongList songs={songs} />
      </section>
    </main>
  );
}
