import Link from 'next/link';
import { MusicLibraryStyleAdminLink } from '@/components/music-library/MusicLibraryStyleAdminLink';
import { formatMusicLibraryOriginLabel } from '@/lib/music-library-labels';
import type { MusicLibraryArtistProfile } from '@/lib/music-library-types';
import { musicLibraryArtistHref } from '@/lib/music-library-urls';
import {
  dedupeIdenticalBioParagraphs,
  splitMusic8ArtistDescription,
} from '@/lib/music8-artist-display';
import { isMcProduct } from '@/lib/product-mode';

type Relation = { name: string; slug: string | null };

function RelationLinks({
  links,
  className,
}: {
  links: Relation[];
  className: string;
}) {
  if (links.length === 0) return <span className="text-gray-500">—</span>;
  return (
    <span>
      {links.map((m, i) => (
        <span key={`${m.name}-${i}`}>
          {i > 0 ? '、' : null}
          {m.slug ? (
            <Link href={musicLibraryArtistHref(m.slug)} className={className}>
              {m.name}
            </Link>
          ) : (
            m.name
          )}
        </span>
      ))}
    </span>
  );
}

function artistBioParts(profile: MusicLibraryArtistProfile): { en: string; ja: string } {
  const fromText = splitMusic8ArtistDescription(profile.profileText);
  const en = dedupeIdenticalBioParagraphs((profile.descriptionEn ?? '').trim() || fromText.en);
  const ja = dedupeIdenticalBioParagraphs(fromText.ja);
  const showEn = Boolean(en && en !== ja && !(ja && ja.includes(en)));
  const showJa = Boolean(ja && ja !== (showEn ? en : ''));
  return { en: showEn ? en : '', ja: showJa ? ja : '' };
}

export function MusicLibraryArtistHero({
  profile,
  adminEditHref,
}: {
  profile: MusicLibraryArtistProfile;
  adminEditHref: string;
}) {
  const mc = isMcProduct();
  const origin = formatMusicLibraryOriginLabel(profile.originCountry ?? profile.originLabel);
  const occupation = (profile.occupation ?? profile.kind ?? '').trim();
  const bio = artistBioParts(profile);
  const memberNames =
    profile.memberLinks.length > 0
      ? profile.memberLinks
      : (profile.membersFallback ?? '')
          .split(/\s*[,、]\s*/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((name) => ({ name, slug: null as string | null }));
  const tone = mc
    ? {
        card: 'overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_16px_48px_-28px_rgba(0,0,0,0.45)]',
        photoCol:
          'flex h-full min-h-[16rem] flex-col border-b border-gray-200 bg-gray-100 md:min-h-[22rem] md:border-b-0 md:border-r md:border-gray-200',
        credit: 'border-t border-gray-200 px-3 py-2 text-[11px] text-gray-500',
        name: 'text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl',
        badge: 'rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-600',
        ja: 'mt-1 text-base text-gray-600',
        en: 'mt-0.5 text-sm text-gray-400',
        meta: 'space-y-1 text-sm text-gray-700',
        label: 'text-gray-400',
        occupation: 'text-gray-800',
        rel: 'text-sky-600 hover:underline',
        bioWrap: 'space-y-3 border-t border-gray-200 pt-3 text-sm leading-relaxed',
        bioEn: 'whitespace-pre-wrap text-gray-500',
        bioJa: 'whitespace-pre-wrap text-gray-800',
        links: 'mt-auto flex flex-wrap gap-2 border-t border-gray-200 pt-3',
        wiki: 'rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-sky-600 hover:border-sky-400',
        spotify:
          'rounded border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs text-green-700 hover:border-green-400',
        youtube: 'rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-600 hover:border-red-400',
        empty: 'flex h-full min-h-[16rem] items-center justify-center text-xs text-gray-400 md:min-h-[22rem]',
      }
    : {
        card: 'overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.9)]',
        photoCol:
          'flex h-full min-h-[16rem] flex-col border-b border-gray-800 bg-black/40 md:min-h-[22rem] md:border-b-0 md:border-r',
        credit: 'border-t border-gray-800 px-3 py-2 text-[11px] text-gray-500',
        name: 'text-2xl font-semibold tracking-tight text-white sm:text-3xl',
        badge:
          'rounded border border-gray-600 bg-gray-950 px-1.5 py-0.5 text-[11px] font-medium text-gray-300',
        ja: 'mt-1 text-base text-gray-300',
        en: 'mt-0.5 text-sm text-gray-500',
        meta: 'space-y-1 text-sm text-gray-300',
        label: 'text-gray-500',
        occupation: 'text-gray-200',
        rel: 'text-sky-400 hover:underline',
        bioWrap: 'space-y-3 border-t border-gray-800 pt-3 text-sm leading-relaxed',
        bioEn: 'whitespace-pre-wrap text-gray-400',
        bioJa: 'whitespace-pre-wrap text-gray-200',
        links: 'mt-auto flex flex-wrap gap-2 border-t border-gray-800 pt-3',
        wiki: 'rounded border border-gray-600 bg-gray-950 px-2.5 py-1.5 text-xs text-sky-300 hover:border-sky-600',
        spotify:
          'rounded border border-green-800/80 bg-green-950/40 px-2.5 py-1.5 text-xs text-green-200 hover:border-green-600',
        youtube:
          'rounded border border-red-900/70 bg-red-950/30 px-2.5 py-1.5 text-xs text-red-200 hover:border-red-700',
        empty: 'flex h-full min-h-[16rem] items-center justify-center text-xs text-gray-600 md:min-h-[22rem]',
      };

  return (
    <section className={tone.card}>
      <div className="grid gap-0 md:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
        <div className={tone.photoCol}>
          <div className="relative aspect-[3/4] min-h-[16rem] flex-1 md:aspect-auto md:min-h-[22rem]">
            {profile.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 動的外部ドメイン
              <img
                src={profile.imageUrl}
                alt={profile.name}
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className={tone.empty}>画像なし</div>
            )}
          </div>
          {profile.imageCredit ? <p className={tone.credit}>{profile.imageCredit}</p> : null}
        </div>

        <div className="relative flex min-w-0 flex-col gap-4 p-4 sm:p-5">
          <MusicLibraryStyleAdminLink href={adminEditHref} />
          <div className="pr-20">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h1 className={tone.name}>{profile.name}</h1>
              {origin ? <span className={tone.badge}>{origin}</span> : null}
            </div>
            {profile.nameJa && profile.nameJa !== profile.name ? (
              <p className={tone.ja}>{profile.nameJa}</p>
            ) : null}
            {profile.nameEn &&
            profile.nameEn !== profile.name &&
            profile.nameEn !== profile.nameJa ? (
              <p className={tone.en}>{profile.nameEn}</p>
            ) : null}
          </div>

          <div className={tone.meta}>
            {occupation ? <p className={tone.occupation}>{occupation}</p> : null}
            {profile.activePeriod ? (
              <p>
                <span className={tone.label}>Active: </span>
                {profile.activePeriod}
              </p>
            ) : null}
            {profile.bornLabel ? (
              <p>
                <span className={tone.label}>Born: </span>
                {profile.bornLabel}
              </p>
            ) : null}
            {profile.diedLabel ? (
              <p>
                <span className={tone.label}>Died: </span>
                {profile.diedLabel}
              </p>
            ) : null}
            {profile.bandLinks.length > 0 ? (
              <p>
                <span className={tone.label}>所属バンド: </span>
                <RelationLinks links={profile.bandLinks} className={tone.rel} />
              </p>
            ) : null}
            {profile.showMembersLine ? (
              <p>
                <span className={tone.label}>Members: </span>
                <RelationLinks links={memberNames} className={tone.rel} />
              </p>
            ) : null}
          </div>

          {bio.en || bio.ja ? (
            <div className={tone.bioWrap}>
              {bio.en ? <p className={tone.bioEn}>{bio.en}</p> : null}
              {bio.ja ? <p className={tone.bioJa}>{bio.ja}</p> : null}
            </div>
          ) : null}

          {(profile.links.wikipedia || profile.links.spotify || profile.links.youtube) ? (
            <div className={tone.links}>
              {profile.links.wikipedia ? (
                <a href={profile.links.wikipedia} target="_blank" rel="noopener noreferrer" className={tone.wiki}>
                  Wikipedia
                </a>
              ) : null}
              {profile.links.spotify ? (
                <a href={profile.links.spotify} target="_blank" rel="noopener noreferrer" className={tone.spotify}>
                  Spotify
                </a>
              ) : null}
              {profile.links.youtube ? (
                <a href={profile.links.youtube} target="_blank" rel="noopener noreferrer" className={tone.youtube}>
                  YouTube
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
