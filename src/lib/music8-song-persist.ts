/**
 * 視聴履歴などで Music8 曲 JSON を取得したとき、DB（songs.music8_song_data）に載せる軽量スナップショット。
 * 将来の Music8 起点インポート・突合用。巨大 HTML（content 等）は含めない。
 */

import { extractMusic8SongFields } from '@/lib/music8-song-fields';

function asObj(x: unknown): Record<string, unknown> | null {
  if (x != null && typeof x === 'object' && !Array.isArray(x)) return x as Record<string, unknown>;
  return null;
}

function asStr(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

function shallowScalarRecord(raw: unknown, maxKeys: number): Record<string, unknown> | null {
  const o = asObj(raw);
  if (!o) return null;
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(o)) {
    if (n >= maxKeys) break;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean' || v === null) {
      const key = k.length > 120 ? k.slice(0, 120) : k;
      out[key] = t === 'string' && (v as string).length > 2000 ? `${(v as string).slice(0, 2000)}…` : v;
      n++;
    }
  }
  return Object.keys(out).length ? out : null;
}

function summarizeWpArtists(raw: unknown): Array<{ id?: number; name?: string; slug?: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ id?: number; name?: string; slug?: string }> = [];
  for (const a of raw) {
    const o = asObj(a);
    if (!o) continue;
    const idRaw = o.id;
    const idNum = typeof idRaw === 'number' ? idRaw : typeof idRaw === 'string' ? Number(idRaw) : NaN;
    out.push({
      id: Number.isFinite(idNum) ? idNum : undefined,
      name:
        typeof o.name === 'string'
          ? o.name
          : typeof o.title === 'string'
            ? o.title
            : undefined,
      slug: typeof o.slug === 'string' ? o.slug : undefined,
    });
    if (out.length >= 16) break;
  }
  return out;
}

/**
 * `fetchMusic8SongDataForPlaybackRow` 等が返す生 JSON から、DB 保存用のオブジェクトを作る。
 * 取れないときは null。
 */
export function buildPersistableMusic8SongSnapshot(data: unknown): Record<string, unknown> | null {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  const capturedAt = new Date().toISOString();

  const sk = asObj(obj.stable_key);
  if (sk && typeof sk.artist_slug === 'string' && typeof sk.song_slug === 'string') {
    const display = asObj(obj.display as unknown);
    const youtube = asObj(obj.youtube as unknown);
    const ex = extractMusic8SongFields(data);
    return {
      kind: 'musicaichat_v1',
      captured_at: capturedAt,
      schema_version: typeof obj.schema_version === 'string' ? obj.schema_version : null,
      stable_key: {
        artist_slug: sk.artist_slug.trim(),
        song_slug: sk.song_slug.trim(),
      },
      display: display
        ? {
            song_title: asStr(display.song_title) || null,
            primary_artist_name: asStr(display.primary_artist_name) || null,
            credit_line: asStr(display.credit_line) || null,
            primary_artist_name_ja: asStr(display.primary_artist_name_ja) || null,
          }
        : null,
      youtube: youtube
        ? {
            primary_id: asStr(youtube.primary_id) || null,
            ids: Array.isArray(youtube.ids)
              ? (youtube.ids as unknown[])
                  .filter((x): x is string => typeof x === 'string')
                  .slice(0, 24)
              : null,
          }
        : null,
      identifiers: shallowScalarRecord(obj.identifiers, 40),
      genres: ex.genres,
      releaseDate_normalized: ex.releaseDate || null,
      styleIds: ex.styleIds,
      styleNames: ex.styleNames,
      /** 洋楽チャットでは取りにくいメタをフラットにもつ（拡張・管理画面用） */
      primary_artist_name_ja: ex.primaryArtistNameJa.trim() || null,
      vocal: ex.vocalLabel.trim() || null,
      structured_style: ex.structuredStyleFromFacts.trim() || null,
    };
  }

  const idRaw = obj.id;
  const idNum = typeof idRaw === 'number' ? idRaw : typeof idRaw === 'string' ? Number(idRaw) : NaN;
  if (Number.isFinite(idNum) && idNum > 0) {
    const ex = extractMusic8SongFields(data);

    // acf（曲レベルの Spotify メタ）
    const acf = asObj(obj.acf as unknown);
    const acfSpotifyReleaseDate = acf ? asStr(acf.spotify_release_date ?? '') : '';
    const acfSpotifyName       = acf ? asStr(acf.spotify_name ?? '') : '';
    const acfSpotifyArtists    = acf ? asStr(acf.spotify_artists ?? '') : '';
    const acfSpotifyImages     = acf ? asStr(acf.spotify_images ?? '') : '';
    const acfSpotifyPopRaw     = acf ? asStr(acf.spotify_popularity ?? '') : '';
    const acfSpotifyPop        = acfSpotifyPopRaw ? Number(acfSpotifyPopRaw) : NaN;
    const acfArtist01Id        = acf ? asStr(acf.spotify_artists01_id ?? '') : '';
    const acfArtist01Images    = acf ? asStr(acf.spotify_artists01_images ?? '') : '';
    const acfArtist01PopRaw    = acf ? asStr(acf.spotify_artists01_popularity ?? '') : '';
    const acfArtist01Pop       = acfArtist01PopRaw ? Number(acfArtist01PopRaw) : NaN;

    // artists[0].acf（アーティストレベル情報）
    const firstArtistRaw = Array.isArray(obj.artists) ? asObj(obj.artists[0] as unknown) : null;
    const firstArtistAcf = firstArtistRaw ? asObj(firstArtistRaw.acf as unknown) : null;
    const artistSpotifyId     = firstArtistAcf ? asStr(firstArtistAcf.spotify_artist_id ?? '') : (acfArtist01Id || '');
    const artistSpotifyImages = firstArtistAcf ? asStr(firstArtistAcf.spotify_artist_images ?? '') : '';
    const artistWikipedia     = firstArtistAcf ? asStr(firstArtistAcf.wikipedia_page ?? '') : '';
    const artistYtChannel     = firstArtistAcf ? asStr(firstArtistAcf.youtube_channel ?? '') : '';
    // spotify_images: acf > top-level
    const spotifyImages = (acfSpotifyImages || asStr(obj.spotify_images ?? '')).trim();

    return {
      kind: 'music8_wp_song',
      captured_at: capturedAt,
      id: idNum,
      slug: typeof obj.slug === 'string' ? obj.slug : null,
      title: typeof obj.title === 'string' ? obj.title : null,
      main_artists: summarizeWpArtists(obj.artists),
      videoId: typeof obj.videoId === 'string' ? obj.videoId : null,
      genres: ex.genres,
      releaseDate_normalized: ex.releaseDate || null,
      styleIds: ex.styleIds,
      styleNames: ex.styleNames,
      primary_artist_name_ja: ex.primaryArtistNameJa.trim() || null,
      vocal: ex.vocalLabel.trim() || null,
      structured_style: ex.structuredStyleFromFacts.trim() || null,
      // Spotify（曲レベル）
      ...(acfSpotifyReleaseDate ? { spotify_release_date: acfSpotifyReleaseDate } : {}),
      ...(acfSpotifyName        ? { spotify_name: acfSpotifyName } : {}),
      ...(acfSpotifyArtists     ? { spotify_artists: acfSpotifyArtists } : {}),
      ...(spotifyImages         ? { spotify_images: spotifyImages } : {}),
      ...(!Number.isNaN(acfSpotifyPop) ? { spotify_popularity: acfSpotifyPop } : {}),
      // Spotify（アーティストレベル）
      ...(acfArtist01Id || artistSpotifyId ? { artist_spotify_id: acfArtist01Id || artistSpotifyId } : {}),
      ...(acfArtist01Images || artistSpotifyImages ? { artist_spotify_images: acfArtist01Images || artistSpotifyImages } : {}),
      ...(!Number.isNaN(acfArtist01Pop) ? { artist_spotify_popularity: acfArtist01Pop } : {}),
      ...(artistWikipedia ? { artist_wikipedia_page: artistWikipedia } : {}),
      ...(artistYtChannel ? { artist_youtube_channel_id: artistYtChannel } : {}),
    };
  }

  return null;
}
