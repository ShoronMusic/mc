import 'server-only';

import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';
import { music8SongJsonUrl } from '@/lib/music8-data-urls';
import { fetchJsonWithOptionalGcsAuth } from '@/lib/music8-gcs-server';
import { parseCollabArtistNamesFromMainArtist } from '@/lib/library-search-query';
import { parseSpotifyArtistsString } from '@/lib/song-credits-resolve';
import { extractYoutubeVideoIdFromWpSongJson } from '@/lib/music8-wp-songs-video-index';
import {
  fetchWpPostByVideoId,
  getMusic8WpRestBaseUrl,
  wpRestPostToMusic8SongJson,
} from '@/lib/music8-wp-rest';

type SlugPair = { artistSlug: string; songSlug: string };

function collectSlugPairs(params: {
  music8ArtistSlug?: string | null;
  music8SongSlug?: string | null;
  spotifyArtists?: string | null;
  mainArtist?: string | null;
}): SlugPair[] {
  const songSlug = (params.music8SongSlug ?? '').trim().toLowerCase();
  const out: SlugPair[] = [];
  const add = (artistSlug: string) => {
    const a = artistSlug.trim().toLowerCase();
    if (!a || !songSlug) return;
    if (!out.some((p) => p.artistSlug === a && p.songSlug === songSlug)) {
      out.push({ artistSlug: a, songSlug });
    }
  };

  if (params.music8ArtistSlug) add(params.music8ArtistSlug);

  let names = parseSpotifyArtistsString(params.spotifyArtists);
  if (names.length === 0 && params.mainArtist) {
    names = parseCollabArtistNamesFromMainArtist(params.mainArtist);
  }
  for (const name of names) {
    const slug = artistNameToMusic8Slug(name);
    if (slug) add(slug);
  }

  return out;
}

/**
 * ライブラリ曲向けに WP 曲 JSON を取得（slug 候補を試し、video_id があれば一致確認）。
 */
export async function fetchMusic8WpSongJsonForLibrary(params: {
  music8ArtistSlug?: string | null;
  music8SongSlug?: string | null;
  spotifyArtists?: string | null;
  mainArtist?: string | null;
  videoId?: string | null;
}): Promise<{ json: Record<string, unknown>; canonicalArtistSlug: string } | null> {
  const videoId = (params.videoId ?? '').trim();
  const pairs = collectSlugPairs(params);

  for (const pair of pairs) {
    const url = music8SongJsonUrl(pair.artistSlug, pair.songSlug);
    const json = await fetchJsonWithOptionalGcsAuth<Record<string, unknown>>(url);
    if (!json || typeof json !== 'object' || Array.isArray(json)) continue;
    if (videoId) {
      const vid = extractYoutubeVideoIdFromWpSongJson(json);
      if (vid && vid !== videoId) continue;
    }
    return { json, canonicalArtistSlug: pair.artistSlug };
  }

  const wpBase = getMusic8WpRestBaseUrl();
  if (videoId && wpBase) {
    const names = parseSpotifyArtistsString(params.spotifyArtists);
    if (names.length === 0 && params.mainArtist) {
      names.push(...parseCollabArtistNamesFromMainArtist(params.mainArtist));
    }
    const lookups = names.length > 0 ? names : [(params.mainArtist ?? '').trim()].filter(Boolean);
    for (const lookup of lookups) {
      const post = await fetchWpPostByVideoId(wpBase, videoId, lookup);
      if (!post) continue;
      const json = wpRestPostToMusic8SongJson(post);
      const slug =
        pairs.find((p) => p.artistSlug === artistNameToMusic8Slug(lookup))?.artistSlug ??
        artistNameToMusic8Slug(lookup) ??
        pairs[0]?.artistSlug ??
        (params.music8ArtistSlug ?? '').trim().toLowerCase();
      return { json, canonicalArtistSlug: slug };
    }
  }

  return null;
}
