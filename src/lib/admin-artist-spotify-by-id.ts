/**
 * 管理: 手動 Spotify artist ID から人気度・画像を上書き取得。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { mergeArtistEnglishNameAfterSpotify } from '@/lib/artist-english-name';
import {
  fetchSpotifyArtistsByIds,
  getSpotifyAccessToken,
  parseSpotifyArtistIdInput,
  type SpotifyArtistMeta,
} from '@/lib/spotify-search-track';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildOverwriteSpotifyArtistPayload(
  meta: SpotifyArtistMeta,
  existing?: { imageUrl?: string | null },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    spotify_artist_id: meta.id,
  };
  if (meta.images) payload.spotify_artist_images = meta.images;
  if (meta.popularity != null && Number.isFinite(meta.popularity)) {
    payload.spotify_artist_popularity = Math.max(0, Math.min(100, Math.round(meta.popularity)));
  }
  const nameEn = mergeArtistEnglishNameAfterSpotify(meta.name);
  if (nameEn) payload.name_en = nameEn;
  const curImage = (existing?.imageUrl ?? '').trim();
  if (!curImage && meta.images) payload.image_url = meta.images;
  return payload;
}

export type ApplyManualSpotifyArtistIdResult =
  | {
      ok: true;
      spotifyArtistId: string;
      spotifyArtistName: string;
      spotifyArtistPopularity: number | null;
      spotifyArtistImages: string | null;
    }
  | { ok: false; error: string; status?: number };

export async function applyManualSpotifyArtistIdToArtist(
  admin: SupabaseClient,
  artistIdRaw: string,
  artistInput: string,
): Promise<ApplyManualSpotifyArtistIdResult> {
  const artistId = artistIdRaw.trim();
  if (!artistId || !UUID_RE.test(artistId)) {
    return { ok: false, error: 'artistId が無効です。', status: 400 };
  }
  const spotifyId = parseSpotifyArtistIdInput(artistInput);
  if (!spotifyId) {
    return {
      ok: false,
      error: 'Spotify の artist ID またはアーティスト URL（open.spotify.com/artist/…）を入力してください。',
      status: 400,
    };
  }

  const token = await getSpotifyAccessToken();
  if (!token) {
    return { ok: false, error: 'SPOTIFY_CLIENT_ID / SECRET が未設定か無効です。', status: 503 };
  }

  const { data: artist, error: artistErr } = await admin
    .from('artists')
    .select('id, image_url')
    .eq('id', artistId)
    .maybeSingle();
  if (artistErr) return { ok: false, error: artistErr.message, status: 500 };
  if (!artist) return { ok: false, error: 'アーティストが見つかりません。', status: 404 };

  const metas = await fetchSpotifyArtistsByIds([spotifyId]);
  const meta = metas[0];
  if (!meta) {
    return { ok: false, error: 'Spotify でアーティストが見つかりませんでした。', status: 404 };
  }

  const payload = buildOverwriteSpotifyArtistPayload(meta, {
    imageUrl: (artist as { image_url?: string | null }).image_url,
  });
  payload.updated_at = new Date().toISOString();

  const { error: uErr } = await admin.from('artists').update(payload).eq('id', artistId);
  if (uErr) return { ok: false, error: uErr.message, status: 500 };

  return {
    ok: true,
    spotifyArtistId: meta.id,
    spotifyArtistName: meta.name,
    spotifyArtistPopularity: meta.popularity,
    spotifyArtistImages: meta.images,
  };
}
