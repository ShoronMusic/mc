/**
 * Spotify 照合用のアーティスト検索ヒント（邦楽日本語名 ↔ 英語表記 / m8 slug）
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSpotifyArtistsByIds } from '@/lib/spotify-search-track';
import type { SpotifyArtistMatchOptions } from '@/lib/spotify-track-match';

/** 選曲時に自動採番された jp-xxxxx は Spotify 検索に使えない */
export function isGeneratedJpArtistSlug(slug: string | null | undefined): boolean {
  const s = (slug ?? '').trim().toLowerCase();
  return /^jp-[a-z0-9]+$/i.test(s);
}

/**
 * music8_artist_slug → Spotify `artist:` 検索用（ハイフンを空白に）。
 * 例: sakanaction → sakanaction / one-ok-rock → one ok rock
 */
export function spotifySearchHintFromMusic8Slug(slug: string | null | undefined): string | null {
  const s = (slug ?? '').trim().toLowerCase();
  if (!s || isGeneratedJpArtistSlug(s)) return null;
  const hint = s.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  return hint || null;
}

/** 照合用エイリアス（空白あり／なし） */
export function artistNameVariantsFromMusic8Slug(slug: string | null | undefined): string[] {
  const hint = spotifySearchHintFromMusic8Slug(slug);
  if (!hint) return [];
  const noSpace = hint.replace(/\s+/g, '');
  return [...new Set([hint, noSpace].filter((x) => x.length > 0))];
}

export type ResolvedSpotifyArtistMatchHints = SpotifyArtistMatchOptions & {
  searchArtistName: string;
  /** 検索に使う名前候補（優先順）。日本語のみのときは latin を先に試す */
  searchArtistNames: string[];
};

function hasLatin(s: string): boolean {
  return /[A-Za-z]/.test(s);
}

function pushUnique(list: string[], value: string | null | undefined): void {
  const v = (value ?? '').trim();
  if (!v) return;
  if (!list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v);
}

/**
 * artists 行 + 曲の music8_artist_slug から検索名／照合エイリアスを組み立てる。
 */
export async function resolveSpotifyArtistMatchHints(
  admin: SupabaseClient,
  mainArtist: string,
  options?: { songMusic8ArtistSlug?: string | null },
): Promise<ResolvedSpotifyArtistMatchHints> {
  const name = mainArtist.split(',')[0]?.trim() || mainArtist.trim();
  const alternateArtistNames: string[] = [];
  const expectedSpotifyArtistIds: string[] = [];
  const searchArtistNames: string[] = [];
  let searchArtistName = name;
  const songSlug = options?.songMusic8ArtistSlug?.trim() || null;

  if (!name) {
    return {
      alternateArtistNames,
      expectedSpotifyArtistIds,
      searchArtistName,
      searchArtistNames: [],
    };
  }

  const esc = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  type ArtistHintRow = {
    name?: string | null;
    name_en?: string | null;
    name_ja?: string | null;
    spotify_artist_id?: string | null;
    music8_artist_slug?: string | null;
  };

  let rows: ArtistHintRow[] | null = null;
  const primary = await admin
    .from('artists')
    .select('name, name_en, name_ja, spotify_artist_id, music8_artist_slug')
    .or(`name.eq."${esc}",name_en.eq."${esc}",name_ja.eq."${esc}"`)
    .limit(5);

  if (!primary.error) {
    rows = (primary.data as ArtistHintRow[] | null) ?? null;
  } else if (primary.error.code === '42703') {
    const fallback = await admin
      .from('artists')
      .select('name, name_en, spotify_artist_id')
      .or(`name.eq."${esc}",name_en.eq."${esc}"`)
      .limit(5);
    if (!fallback.error) rows = (fallback.data as ArtistHintRow[] | null) ?? null;
  } else {
    console.warn('[spotify-artist-match-hints] artist lookup', primary.error.message);
  }

  // 曲側 slug で artists を追加照会（名前一致が取れないとき）
  if (songSlug && !isGeneratedJpArtistSlug(songSlug)) {
    try {
      const bySlug = await admin
        .from('artists')
        .select('name, name_en, name_ja, spotify_artist_id, music8_artist_slug')
        .eq('music8_artist_slug', songSlug)
        .limit(3);
      if (!bySlug.error && bySlug.data?.length) {
        const extra = bySlug.data as ArtistHintRow[];
        rows = [...(rows ?? []), ...extra];
      }
    } catch {
      /* ignore */
    }
  }

  const slugs: string[] = [];
  if (songSlug) slugs.push(songSlug);

  for (const row of rows ?? []) {
    if (row.name?.trim()) alternateArtistNames.push(row.name.trim());
    if (row.name_en?.trim()) {
      alternateArtistNames.push(row.name_en.trim());
      if (hasLatin(row.name_en)) {
        searchArtistName = row.name_en.trim();
        pushUnique(searchArtistNames, row.name_en.trim());
      }
    }
    if (row.name_ja?.trim()) alternateArtistNames.push(row.name_ja.trim());
    if (row.spotify_artist_id?.trim()) {
      expectedSpotifyArtistIds.push(row.spotify_artist_id.trim());
    }
    if (row.music8_artist_slug?.trim()) slugs.push(row.music8_artist_slug.trim());
  }

  for (const slug of slugs) {
    for (const v of artistNameVariantsFromMusic8Slug(slug)) {
      alternateArtistNames.push(v);
      pushUnique(searchArtistNames, v);
    }
    const hint = spotifySearchHintFromMusic8Slug(slug);
    if (hint && !hasLatin(searchArtistName)) {
      searchArtistName = hint;
    }
  }

  // name_en が空でも spotify_artist_id があれば Spotify から英語表記を取る
  if (expectedSpotifyArtistIds.length > 0 && !hasLatin(searchArtistName)) {
    try {
      const metas = await fetchSpotifyArtistsByIds(expectedSpotifyArtistIds.slice(0, 1));
      const spName = metas[0]?.name?.trim();
      if (spName) {
        searchArtistName = spName;
        alternateArtistNames.push(spName);
        pushUnique(searchArtistNames, spName);
      }
    } catch {
      /* ignore */
    }
  }

  // 日本語名も候補に残す（市場によってはヒットする）
  pushUnique(searchArtistNames, name);

  const slugHints = new Set(
    slugs.flatMap((s) => artistNameVariantsFromMusic8Slug(s).map((v) => v.toLowerCase())),
  );
  // 日本語 main のとき: 汚染された name_en より m8 slug 由来を優先
  const mainIsJpOnly = !hasLatin(name);
  searchArtistNames.sort((a, b) => {
    const aSlug = slugHints.has(a.toLowerCase()) ? 1 : 0;
    const bSlug = slugHints.has(b.toLowerCase()) ? 1 : 0;
    if (mainIsJpOnly && aSlug !== bSlug) return bSlug - aSlug;
    return Number(hasLatin(b)) - Number(hasLatin(a));
  });

  if (searchArtistNames.length > 0) {
    const preferred =
      (mainIsJpOnly && searchArtistNames.find((n) => slugHints.has(n.toLowerCase()))) ||
      searchArtistNames.find((n) => hasLatin(n)) ||
      searchArtistNames[0]!;
    searchArtistName = preferred;
  }

  return {
    alternateArtistNames: [...new Set(alternateArtistNames.filter((n) => n !== name))],
    expectedSpotifyArtistIds: [...new Set(expectedSpotifyArtistIds)],
    crossScriptArtistNames: [...slugHints],
    searchArtistName,
    searchArtistNames: searchArtistNames.slice(0, 3),
  };
}
